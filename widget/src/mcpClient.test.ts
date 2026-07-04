import { describe, expect, it, vi, afterEach } from "vitest";
import { callDiagnoseTool } from "./mcpClient.js";

const okResult = {
  mode: "NOT_A_FAILURE",
  confidence: 1,
  evidence: { blockNumber: 100 },
  ruleTriggered: "diagnoseLive:successNoRuleMatched",
  healthy: true,
};

function mockFetch(bodyText: string, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok, status, text: async () => bodyText })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("callDiagnoseTool", () => {
  it("parses a plain JSON response", async () => {
    mockFetch(
      JSON.stringify({ jsonrpc: "2.0", id: 1, result: { structuredContent: okResult } })
    );
    const diagnosis = await callDiagnoseTool("https://example.com/mcp", { txHash: "0xabc", chainId: 196 });
    expect(diagnosis.mode).toBe("NOT_A_FAILURE");
  });

  it("parses an SSE-framed response (confirmed live shape from sherpas-support-mcp-server)", async () => {
    mockFetch(
      `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: 1, result: { structuredContent: okResult } })}\n\n`
    );
    const diagnosis = await callDiagnoseTool("https://example.com/mcp", { txHash: "0xabc", chainId: 196 });
    expect(diagnosis.mode).toBe("NOT_A_FAILURE");
    expect(diagnosis.healthy).toBe(true);
  });

  it("throws with the tool's error text when isError is set", async () => {
    mockFetch(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: { content: [{ type: "text", text: "Chain ID 137 isn't supported." }], isError: true },
      })
    );
    await expect(callDiagnoseTool("https://example.com/mcp", { txHash: "0xabc", chainId: 137 })).rejects.toThrow(
      "Chain ID 137 isn't supported."
    );
  });

  it("throws on a JSON-RPC-level error envelope", async () => {
    mockFetch(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: "Invalid params" } }));
    await expect(callDiagnoseTool("https://example.com/mcp", { txHash: "0xabc", chainId: 196 })).rejects.toThrow(
      "Invalid params"
    );
  });

  it("throws on a non-2xx HTTP status", async () => {
    mockFetch("Internal Server Error", false, 500);
    await expect(callDiagnoseTool("https://example.com/mcp", { txHash: "0xabc", chainId: 196 })).rejects.toThrow(
      "HTTP 500"
    );
  });
});
