import type { Diagnosis } from "./types.js";

export interface DiagnoseArgs {
  txHash: string;
  chainId: number;
  expectedChainId?: number;
}

/**
 * Calls the `diagnose_transaction` MCP tool over streamable HTTP. This talks
 * real MCP JSON-RPC, not a REST shortcut — the widget is meant to work
 * against any conformant MCP server, not just one shaped like ours.
 *
 * The server can reply as a single JSON body or as a one-shot SSE frame
 * (`event: message\ndata: {...}`) depending on content negotiation —
 * confirmed live against sherpas-support-mcp-server, which returns the
 * SSE-framed form for a stateless POST. Both are handled here.
 */
export async function callDiagnoseTool(mcpEndpoint: string, args: DiagnoseArgs): Promise<Diagnosis> {
  const res = await fetch(mcpEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name: "diagnose_transaction", arguments: args },
    }),
  });

  if (!res.ok) {
    throw new Error(`MCP server responded with HTTP ${res.status}`);
  }

  const raw = await res.text();
  const envelope = parseJsonRpcResponse(raw);

  if (envelope.error) {
    throw new Error(envelope.error.message ?? "MCP server returned an error.");
  }

  const result = envelope.result as
    | { content?: Array<{ type: string; text?: string }>; structuredContent?: Diagnosis; isError?: boolean }
    | undefined;

  if (!result) {
    throw new Error("MCP server returned an empty result.");
  }

  if (result.isError) {
    const message = result.content?.[0]?.text ?? "Diagnosis failed.";
    throw new Error(message);
  }

  if (result.structuredContent) {
    return result.structuredContent;
  }

  // Fallback: some clients/proxies strip structuredContent — the text
  // content is still a readable summary, but callers need the structured
  // shape to render cards, so this is a hard failure, not a soft one.
  throw new Error("MCP tool result had no structuredContent to render.");
}

interface JsonRpcResponse {
  result?: unknown;
  error?: { code: number; message: string };
}

function parseJsonRpcResponse(raw: string): JsonRpcResponse {
  const trimmed = raw.trim();

  // SSE framing: one or more "event: ...\ndata: {...}" blocks — take the
  // last data payload (the final message frame).
  if (trimmed.startsWith("event:") || trimmed.includes("\ndata:")) {
    const dataLines = trimmed
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim());

    const lastData = dataLines[dataLines.length - 1];
    if (!lastData) throw new Error("Couldn't parse the MCP server's SSE response.");
    return JSON.parse(lastData) as JsonRpcResponse;
  }

  return JSON.parse(trimmed) as JsonRpcResponse;
}
