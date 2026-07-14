import { x402Client } from "@okxweb3/x402-core/client";
import { x402HTTPClient } from "@okxweb3/x402-core/http";
import { ExactEvmScheme } from "@okxweb3/x402-evm/exact/client";
import { toClientEvmSigner } from "@okxweb3/x402-evm";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

/**
 * The widget's backend proxy's payer identity: the embedding protocol's own
 * funded wallet, held server-side only. Never touches the browser — see
 * app/api/diagnose-proxy/route.ts, the only caller of this module.
 *
 * Unlike the earlier MPP-based client, this needs no token/recipient/domain
 * config of its own — the server's 402 response declares all of that
 * (asset, amount, payTo, EIP-712 domain), and the SDK reads it directly.
 */
function getPayerAccount() {
  const pk = process.env.DIAGNOSIS_PAYER_PRIVATE_KEY;
  if (!pk) throw new Error("Missing DIAGNOSIS_PAYER_PRIVATE_KEY — the proxy has no funded wallet to pay with.");
  return privateKeyToAccount(pk as Hex);
}

let cachedClient: x402HTTPClient | null = null;

function getClient(): x402HTTPClient {
  if (cachedClient) return cachedClient;
  const account = getPayerAccount();
  const signer = toClientEvmSigner(account);
  const coreClient = new x402Client().register("eip155:*", new ExactEvmScheme(signer));
  cachedClient = new x402HTTPClient(coreClient);
  return cachedClient;
}

export interface DiagnoseProxyResult {
  status: number;
  body: unknown;
}

/**
 * The actual pay-as-you-go mechanic: probes the gated MCP server, and on a
 * 402 challenge signs a single EIP-3009 payment covering the exact price it
 * declared, then replays the request with the signature attached. No
 * channel, no persisted state — every call is a standalone payment.
 */
export async function payAndDiagnose(mcpServerUrl: string, mcpRequestBody: unknown): Promise<DiagnoseProxyResult> {
  const client = getClient();

  const probe = await postToMcp(mcpServerUrl, mcpRequestBody);
  if (probe.status !== 402) {
    // Server isn't actually payment-gated (e.g. local dev without OKX env vars) — pass through.
    return { status: probe.status, body: await probe.json().catch(() => null) };
  }

  const paymentRequired = client.getPaymentRequiredResponse((name) => probe.headers.get(name));
  const paymentPayload = await client.createPaymentPayload(paymentRequired);
  const paymentHeaders = client.encodePaymentSignatureHeader(paymentPayload);

  const paidResponse = await postToMcp(mcpServerUrl, mcpRequestBody, paymentHeaders);
  const body = await parseMcpResponse(paidResponse);

  return { status: paidResponse.status, body };
}

/**
 * MCP's Streamable HTTP transport can respond as either application/json OR
 * text/event-stream (SSE) depending on client Accept + transport internals —
 * we always accept both. For SSE, the JSON-RPC response is carried in the
 * `data:` line of the first `event: message` frame; extract it.
 */
async function parseMcpResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("text/event-stream")) {
    for (const line of text.split(/\r?\n/)) {
      if (line.startsWith("data:")) {
        const payload = line.slice(5).trim();
        if (payload) {
          try { return JSON.parse(payload); } catch { return null; }
        }
      }
    }
    return null;
  }

  try { return JSON.parse(text); } catch { return null; }
}

async function postToMcp(mcpServerUrl: string, body: unknown, extraHeaders?: Record<string, string>): Promise<Response> {
  return fetch(mcpServerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}
