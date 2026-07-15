import type { IncomingMessage } from "node:http";
import { OKXFacilitatorClient } from "@okxweb3/x402-core";
import { x402ResourceServer } from "@okxweb3/x402-core/server";
import {
  x402HTTPResourceServer,
  decodePaymentRequiredHeader,
  decodePaymentResponseHeader,
  type HTTPAdapter,
  type HTTPRequestContext,
  type HTTPTransportContext,
} from "@okxweb3/x402-core/http";
import type { Network, PaymentPayload, PaymentRequirements } from "@okxweb3/x402-core/types";
import { ExactEvmScheme } from "@okxweb3/x402-evm/exact/server";
import { MCP_HTTP_PATH } from "../constants.js";
import { DIAGNOSIS_UNIT_PRICE_USD } from "./pricing.js";
import { recordReceipt } from "./receiptLog.js";

/**
 * x402 "exact" scheme payment gate for diagnose_transaction, per OKX.AI's
 * A2MCP requirement (A2MCP paid endpoints must support x402 — MPP session
 * doesn't qualify, see conversation/OKX A2MCP guide). Each call is a
 * standalone upfront payment: 402 challenge -> buyer signs EIP-3009
 * authorization -> we verify -> settle -> serve. No channel, no voucher.
 */
const X_LAYER_NETWORK: Network = "eip155:196";

export interface PaymentGate {
  /** True once OKX credentials + a payTo address are present — lets callers skip gating entirely in dev if unset. */
  enabled: boolean;
  initialize(): Promise<void>;
  check(req: IncomingMessage): Promise<PaymentGateCheckResult>;
}

export type PaymentGateCheckResult =
  | { ok: true; paymentPayload: PaymentPayload; paymentRequirements: PaymentRequirements; parsedBody: unknown; context: HTTPRequestContext }
  | { ok: false; status: number; headers: Record<string, string>; body: unknown };

let cachedGate: PaymentGate | null = null;
/** Set alongside cachedGate so settlePayment can reuse the same initialized httpServer instance. */
let cachedGateHttpServer: x402HTTPResourceServer | null = null;

export function getX402Gate(): PaymentGate {
  if (cachedGate) return cachedGate;

  const apiKey = process.env.OKX_API_KEY;
  const secretKey = process.env.OKX_SECRET_KEY;
  const passphrase = process.env.OKX_PASSPHRASE;
  // Reuses the same recipient address configured for the earlier MPP setup if
  // a dedicated X402_PAY_TO isn't set, so switching protocols doesn't require
  // re-entering an address that's already correct.
  const payTo = process.env.X402_PAY_TO ?? process.env.MPP_RECIPIENT;

  if (!apiKey || !secretKey || !passphrase || !payTo) {
    cachedGate = {
      enabled: false,
      async initialize() {},
      async check(_req) {
        return {
          ok: true,
          paymentPayload: null as unknown as PaymentPayload,
          paymentRequirements: null as unknown as PaymentRequirements,
          parsedBody: undefined,
          context: null as unknown as HTTPRequestContext,
        };
      },
    };
    return cachedGate;
  }

  const facilitatorClient = new OKXFacilitatorClient({ apiKey, secretKey, passphrase });
  const resourceServer = new x402ResourceServer(facilitatorClient).register(X_LAYER_NETWORK, new ExactEvmScheme());

  const routes = {
    [`POST ${MCP_HTTP_PATH}`]: {
      accepts: {
        scheme: "exact",
        network: X_LAYER_NETWORK,
        payTo,
        price: `$${DIAGNOSIS_UNIT_PRICE_USD}`,
        maxTimeoutSeconds: 300,
      },
      description: "diagnose_transaction - pay-as-you-go onchain diagnosis",
      mimeType: "application/json",
    },
  };

  const httpServer = new x402HTTPResourceServer(resourceServer, routes);
  let initialized: Promise<void> | null = null;

  cachedGate = {
    enabled: true,
    async initialize() {
      if (!initialized) initialized = httpServer.initialize();
      await initialized;
    },
    async check(req) {
      const { adapter, parsedBody } = await buildAdapter(req);
      const url = new URL(req.url ?? MCP_HTTP_PATH, `http://${req.headers.host ?? "localhost"}`);
      const context: HTTPRequestContext = {
        adapter,
        path: url.pathname,
        method: req.method ?? "POST",
      };

      const result = await httpServer.processHTTPRequest(context);

      if (result.type === "payment-error") {
        return {
          ok: false,
          status: result.response.status,
          headers: result.response.headers,
          body: mirrorX402HeaderIntoBody(result.response.headers, result.response.body),
        };
      }

      if (result.type === "no-payment-required") {
        // Shouldn't happen for MCP_HTTP_PATH (always configured to require payment) —
        // defensive fallback: proceed without a payment payload to settle.
        return {
          ok: true,
          paymentPayload: null as unknown as PaymentPayload,
          paymentRequirements: null as unknown as PaymentRequirements,
          parsedBody,
          context,
        };
      }

      return {
        ok: true,
        paymentPayload: result.paymentPayload,
        paymentRequirements: result.paymentRequirements,
        parsedBody,
        context,
      };
    },
  };

  cachedGateHttpServer = httpServer;
  return cachedGate;
}

export type SettleResult = { ok: true; headers: Record<string, string> } | { ok: false; status: number; headers: Record<string, string>; body: unknown };

/**
 * Settles a verified payment (moves funds) and returns headers to attach to
 * the response, or a failure to write instead. We settle BEFORE running the
 * tool (rather than after, as OKX's express reference middleware does)
 * because MCP's StreamableHTTPServerTransport calls flushHeaders / writes to
 * the underlying socket in ways we can't reliably intercept, which broke a
 * previous buffer-then-replay attempt (headers went out mid-tool, then our
 * post-settle flush crashed with ERR_HTTP_HEADERS_SENT, leaving the client
 * hanging until timeout — see commit history for the diagnostic run). The
 * tool is a deterministic RPC read that essentially never errors, so
 * charge-on-error is not a real concern here.
 */
export async function settlePayment(
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
  context: HTTPRequestContext
): Promise<SettleResult> {
  if (!cachedGateHttpServer) return { ok: true, headers: {} }; // ungated dev mode — nothing to settle

  const transportContext: HTTPTransportContext = { request: context };
  const result = await cachedGateHttpServer.processSettlement(paymentPayload, paymentRequirements, undefined, transportContext);

  if (!result.success) {
    return {
      ok: false,
      status: result.response.status,
      headers: result.response.headers,
      body: mirrorX402HeaderIntoBody(result.response.headers, result.response.body),
    };
  }

  void recordReceipt({
    timestamp: new Date().toISOString(),
    payer: result.payer ?? "unknown",
    spentBaseUnits: paymentRequirements.amount,
    transaction: result.transaction,
  });

  return { ok: true, headers: result.headers };
}

/**
 * The x402-core SDK only puts the challenge / settlement-failure payload in
 * a base64 header (PAYMENT-REQUIRED / PAYMENT-RESPONSE) and leaves the JSON
 * body empty (`{}`) unless a route hook supplies one — see
 * RouteConfig.unpaidResponseBody / settlementFailedResponseBody in
 * @okxweb3/x402-core/http. OKX's A2MCP listing review flagged exactly this:
 * their client expects the same challenge mirrored into the response body,
 * not just the header, in order to complete its replay flow. Rather than
 * duplicating the SDK's payload-construction logic via those hooks, we just
 * decode whichever header the SDK already built and use that as the body —
 * guarantees byte-for-byte agreement between the two by construction.
 */
function mirrorX402HeaderIntoBody(headers: Record<string, string>, fallbackBody: unknown): unknown {
  const paymentRequired = headers["PAYMENT-REQUIRED"];
  if (paymentRequired) {
    try {
      return decodePaymentRequiredHeader(paymentRequired);
    } catch {
      // fall through to fallbackBody
    }
  }
  const paymentResponse = headers["PAYMENT-RESPONSE"];
  if (paymentResponse) {
    try {
      return decodePaymentResponseHeader(paymentResponse);
    } catch {
      // fall through to fallbackBody
    }
  }
  return fallbackBody;
}

async function buildAdapter(req: IncomingMessage): Promise<{ adapter: HTTPAdapter; parsedBody: unknown }> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const bodyBuffer = Buffer.concat(chunks);

  let parsedBody: unknown;
  if (bodyBuffer.length > 0) {
    try {
      parsedBody = JSON.parse(bodyBuffer.toString("utf8"));
    } catch {
      parsedBody = undefined;
    }
  }

  const getHeader = (name: string): string | undefined => {
    const value = req.headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  };

  const adapter: HTTPAdapter = {
    getHeader,
    getMethod: () => req.method ?? "POST",
    getPath: () => new URL(req.url ?? MCP_HTTP_PATH, `http://${req.headers.host ?? "localhost"}`).pathname,
    getUrl: () => req.url ?? MCP_HTTP_PATH,
    getAcceptHeader: () => getHeader("accept") ?? "",
    getUserAgent: () => getHeader("user-agent") ?? "",
    getBody: () => parsedBody,
  };

  return { adapter, parsedBody };
}
