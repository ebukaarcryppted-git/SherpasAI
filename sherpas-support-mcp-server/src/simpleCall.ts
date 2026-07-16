import type { IncomingMessage, ServerResponse } from "node:http";
import { X_LAYER_MAINNET_ID } from "./services/onchain-reader.js";
import { runDiagnosis } from "./services/runDiagnosis.js";
import { MCP_HTTP_PATH } from "./constants.js";

/**
 * OKX's A2MCP guide describes a plain "POST your params, get 402 or your
 * result back directly" contract — no JSON-RPC envelope, no MCP protocol
 * (sessions, SSE negotiation, etc.) anywhere in it. That's a different,
 * much simpler thing than the official Model Context Protocol we built
 * this endpoint on top of via @modelcontextprotocol/sdk. OKX's actual
 * platform caller was confirmed (via live testing) to retry with a GET
 * request that the real MCP transport can't accept a tool call through at
 * all (GET is reserved for opening an SSE notification stream per the MCP
 * spec) — a structural mismatch, not a header nitpick.
 *
 * This module lets the same /mcp endpoint serve both: a real MCP JSON-RPC
 * body (jsonrpc: "2.0") still goes through the full MCP transport
 * unchanged; anything else (a plain body, query params, or no body at all,
 * as a GET compliance-checker sends) is treated as a direct A2MCP call and
 * answered with the flat Diagnosis JSON the guide's contract expects.
 */
export function isMcpJsonRpcEnvelope(parsedBody: unknown): boolean {
  return (
    typeof parsedBody === "object" &&
    parsedBody !== null &&
    (parsedBody as Record<string, unknown>).jsonrpc === "2.0"
  );
}

function firstDefined(...values: Array<string | null | undefined>): string | undefined {
  for (const v of values) {
    if (v !== null && v !== undefined && v !== "") return v;
  }
  return undefined;
}

export async function handleSimpleCall(req: IncomingMessage, res: ServerResponse, parsedBody: unknown): Promise<void> {
  const url = new URL(req.url ?? MCP_HTTP_PATH, `http://${req.headers.host ?? "localhost"}`);
  const q = url.searchParams;
  const body = typeof parsedBody === "object" && parsedBody !== null ? (parsedBody as Record<string, unknown>) : {};

  const txHash = firstDefined(
    typeof body.txHash === "string" ? body.txHash : undefined,
    typeof body.hash === "string" ? body.hash : undefined,
    q.get("txHash"),
    q.get("hash")
  );

  const chainIdRaw = firstDefined(
    body.chainId !== undefined ? String(body.chainId) : undefined,
    body.chain_id !== undefined ? String(body.chain_id) : undefined,
    q.get("chainId"),
    q.get("chain_id")
  );
  // Defaults to X Layer — the network this ASP is registered against — when
  // the caller doesn't specify one, since A2MCP's plain-call contract
  // doesn't guarantee a chainId param the way a real MCP tool schema would.
  const chainId = chainIdRaw !== undefined ? Number(chainIdRaw) : X_LAYER_MAINNET_ID;

  const expectedChainIdRaw = firstDefined(
    body.expectedChainId !== undefined ? String(body.expectedChainId) : undefined,
    body.expected_chain_id !== undefined ? String(body.expected_chain_id) : undefined,
    q.get("expectedChainId"),
    q.get("expected_chain_id")
  );
  const expectedChainId = expectedChainIdRaw !== undefined ? Number(expectedChainIdRaw) : undefined;

  if (!txHash) {
    res.writeHead(400, { "Content-Type": "application/json" }).end(
      JSON.stringify({
        error:
          "Missing transaction hash. Provide it as 'txHash' (or 'hash') in the JSON body, or as a ?txHash=/?hash= query parameter.",
      })
    );
    return;
  }

  const result = await runDiagnosis({ txHash, chainId, expectedChainId });

  if (!result.ok) {
    res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: result.error }));
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(result.diagnosis));
}
