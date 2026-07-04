import type { IncomingMessage } from "node:http";
import { Mppx, Credential } from "@okxweb3/mpp";
import { session } from "@okxweb3/mpp/evm/server";
import { SaApiClient } from "@okxweb3/mpp/evm";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { DIAGNOSIS_UNIT_PRICE_BASE_UNITS, SUGGESTED_DEPOSIT_BASE_UNITS } from "./pricing.js";
import { recordReceipt } from "./receiptLog.js";

/**
 * X Layer mainnet — matches the rest of this project, and is what OKX's own
 * MPP escrow contract is deployed on (session()'s own default chainId).
 */
const X_LAYER_CHAIN_ID = 196;

/**
 * OKX's shared MPP escrow contract on X Layer (session()'s own hardcoded
 * default — see @okxweb3/mpp/dist/evm/server/Session.js). Override via env if
 * a different deployment is required.
 */
const DEFAULT_ESCROW_CONTRACT: Hex = "0x5E550002e64FaF79B41D89fE8439eEb1be66CE3b";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name} for payment gating.`);
  return value;
}

let cachedGate: PaymentGate | null = null;

export interface PaymentGate {
  /** True once OKX credentials are present — lets callers skip gating entirely in dev if unset. */
  enabled: boolean;
  check(req: IncomingMessage): Promise<PaymentGateResult>;
}

export type PaymentGateResult =
  /**
   * `parsedBody` is handed straight to the MCP SDK's `transport.handleRequest(req, res, parsedBody)`
   * — the gate already buffered and consumed `req`'s stream to build a Web Request for mppx, so the
   * SDK must not try to read the (now-drained) Node stream itself.
   */
  | { ok: true; kind: "resource"; receiptHeaders: Record<string, string>; parsedBody: unknown }
  /**
   * open/topUp/close are channel-management actions, not resource calls —
   * mppx's own session() responds to them directly (its `respond()` hook
   * returns 204, see @okxweb3/mpp/evm/server/Session.ts) and the underlying
   * diagnose_transaction tool must NOT run for these. Write this response
   * as-is; nothing else in the pipeline runs.
   */
  | { ok: true; kind: "management"; status: number; headers: Record<string, string>; body: string }
  | { ok: false; status: number; headers: Record<string, string>; body: string };

/**
 * Builds (once, lazily) the Mppx session gate for diagnose_transaction.
 * Returns `enabled: false` when OKX credentials aren't configured, so a
 * fresh checkout / local dev without payment env vars still runs the tool
 * ungated rather than hard-failing on missing secrets it doesn't need yet.
 */
export function getPaymentGate(): PaymentGate {
  if (cachedGate) return cachedGate;

  const apiKey = process.env.OKX_API_KEY;
  const secretKey = process.env.OKX_SECRET_KEY;
  const passphrase = process.env.OKX_PASSPHRASE;
  const mppSecretKey = process.env.MPP_SECRET_KEY;
  const merchantPrivateKey = process.env.MPP_MERCHANT_PRIVATE_KEY;

  if (!apiKey || !secretKey || !passphrase || !mppSecretKey || !merchantPrivateKey) {
    cachedGate = {
      enabled: false,
      async check(_req) {
        // Ungated path never touches the body stream, so the SDK reads it normally.
        return { ok: true, kind: "resource", receiptHeaders: {}, parsedBody: undefined };
      },
    };
    return cachedGate;
  }

  const saClient = new SaApiClient({ apiKey, secretKey, passphrase });
  const sellerSigner = privateKeyToAccount(merchantPrivateKey as Hex);
  const escrowContract = (process.env.MPP_ESCROW as Hex | undefined) ?? DEFAULT_ESCROW_CONTRACT;
  const currency = requiredEnvForGating("MPP_CURRENCY");
  const recipient = requiredEnvForGating("MPP_RECIPIENT");

  const mppx = Mppx.create({
    methods: [session({ saClient, signer: sellerSigner, chainId: X_LAYER_CHAIN_ID, escrowContract })],
    secretKey: mppSecretKey,
  });

  const SESSION_ROUTE = {
    amount: DIAGNOSIS_UNIT_PRICE_BASE_UNITS,
    currency,
    recipient,
    // ASCII only: this string gets echoed into a challenge header, which
    // must be a valid ByteString (Latin-1) — a Unicode em-dash here throws
    // deep inside undici's Response constructor with a cryptic ByteString error.
    description: "diagnose_transaction - pay-as-you-go onchain diagnosis",
    unitType: "diagnosis",
    suggestedDeposit: SUGGESTED_DEPOSIT_BASE_UNITS,
    methodDetails: {
      chainId: X_LAYER_CHAIN_ID,
      escrowContract,
      feePayer: true,
    },
  } as const;

  cachedGate = {
    enabled: true,
    async check(req) {
      const { webRequest, parsedBody } = await toWebRequest(req);
      const result = await mppx.session(SESSION_ROUTE)(webRequest);

      if (result.status === 402) {
        const challenge = result.challenge;
        return {
          ok: false,
          status: challenge.status,
          headers: Object.fromEntries(challenge.headers.entries()),
          body: await challenge.text(),
        };
      }

      const action = peekCredentialAction(webRequest);

      if (action === "open" || action === "topUp" || action === "close") {
        // Management action: mppx's respond() hook ignores whatever Response
        // we pass to withReceipt() and returns its own 204 + receipt headers
        // instead — that response IS the final answer, the MCP tool must not run.
        const managementResponse = await result.withReceipt(new Response(null, { status: 204 }));
        const headers = Object.fromEntries(managementResponse.headers.entries());
        void recordFromReceiptHeaders(headers, action);
        return { ok: true, kind: "management", status: managementResponse.status, headers, body: await managementResponse.text() };
      }

      const receiptResponse = await result.withReceipt(new Response(null, { status: 204 }));
      const receiptHeaders = Object.fromEntries(receiptResponse.headers.entries());

      void recordFromReceiptHeaders(receiptHeaders, "voucher");

      return { ok: true, kind: "resource", receiptHeaders, parsedBody };
    },
  };
  return cachedGate;

  function requiredEnvForGating(name: string): string {
    return requiredEnv(name);
  }
}

/**
 * Cheaply peeks at the credential's action without duplicating mppx's real
 * verification (HMAC/expiry/schema checks all still happen inside
 * mppx.session() itself) — this only decides local control flow: whether the
 * underlying diagnose_transaction tool should run at all.
 */
function peekCredentialAction(webRequest: Request): string | undefined {
  const header = webRequest.headers.get("authorization");
  if (!header) return undefined;
  try {
    // Credential.deserialize expects the raw header value, "Payment <base64url>"
    // prefix included — it does its own scheme-prefix matching internally.
    const credential = Credential.deserialize(header);
    return (credential.payload as { action?: string } | undefined)?.action;
  } catch {
    return undefined;
  }
}

/** Reads the just-attached Payment-Receipt header and appends an accounting row (best-effort). */
async function recordFromReceiptHeaders(
  headers: Record<string, string>,
  action: "voucher" | "open" | "topUp" | "close"
): Promise<void> {
  const raw = headers["payment-receipt"] ?? headers["Payment-Receipt"];
  if (!raw) return;
  try {
    const decoded = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    await recordReceipt({
      timestamp: new Date().toISOString(),
      channelId: decoded.channelId ?? "unknown",
      payer: decoded.payer ?? "unknown",
      units: decoded.units ?? 0,
      spentBaseUnits: decoded.spent ?? "0",
      action,
    });
  } catch {
    // Receipt header shape can vary by action (open/topUp/close vs voucher) —
    // logging is best-effort bookkeeping, never allowed to affect the response.
  }
}

/**
 * Converts a raw Node request into a Web Standard Request for mppx, buffering
 * the body once. Also returns the parsed JSON body so the caller can hand it
 * to `transport.handleRequest(req, res, parsedBody)` afterwards instead of
 * letting the MCP SDK try to read the now-drained Node stream itself.
 */
async function toWebRequest(req: IncomingMessage): Promise<{ webRequest: Request; parsedBody: unknown }> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const bodyBuffer = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

  const host = req.headers.host ?? "localhost";
  const url = `http://${host}${req.url ?? "/"}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
    else headers.set(key, value);
  }

  const method = req.method ?? "GET";
  const canHaveBody = method !== "GET" && method !== "HEAD";
  const webRequest = new Request(url, {
    method,
    headers,
    body: canHaveBody ? bodyBuffer : undefined,
  });

  let parsedBody: unknown;
  if (bodyBuffer && bodyBuffer.length > 0) {
    try {
      parsedBody = JSON.parse(bodyBuffer.toString("utf8"));
    } catch {
      parsedBody = undefined;
    }
  }

  return { webRequest, parsedBody };
}
