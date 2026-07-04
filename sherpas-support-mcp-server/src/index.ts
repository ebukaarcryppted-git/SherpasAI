#!/usr/bin/env node
import { createServer as createHttpServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerDiagnoseTool } from "./tools/diagnose.js";
import { SERVER_NAME, SERVER_VERSION, SERVER_DESCRIPTION, DEFAULT_HTTP_PORT, MCP_HTTP_PATH } from "./constants.js";
import { getPaymentGate } from "./payments/session.js";

/** Fresh server per connection — tools are cheap to register, and this avoids any state bleeding across concurrent stdio/HTTP callers. */
function createServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
    description: SERVER_DESCRIPTION,
  });
  registerDiagnoseTool(server);
  return server;
}

async function runStdio(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} running on stdio.`);
}

/**
 * Stateless streamable HTTP: a fresh McpServer + transport per request,
 * per the SDK's documented stateless pattern (sessionIdGenerator:
 * undefined). This is the transport that matters for the demo — "point
 * your MCP client at this URL" — the widget and any remote client hit this,
 * not stdio.
 */
async function runHttp(): Promise<void> {
  const port = Number(process.env.PORT ?? DEFAULT_HTTP_PORT);
  const paymentGate = getPaymentGate();
  if (paymentGate.enabled) {
    console.error(`${SERVER_NAME}: diagnose_transaction is pay-as-you-go gated (OKX MPP session).`);
  } else {
    console.error(`${SERVER_NAME}: payment env vars not set — running ungated.`);
  }

  const httpServer = createHttpServer(async (req, res) => {
    if (!req.url || !req.url.startsWith(MCP_HTTP_PATH)) {
      res.writeHead(404).end("Not found");
      return;
    }

    // Gate before ever touching the MCP transport — a request without a
    // valid session voucher gets a 402 + challenge and never reaches
    // diagnose_transaction at all.
    const gateResult = await paymentGate.check(req).catch((err) => {
      console.error("Payment gate check failed:", err);
      return null;
    });
    if (!gateResult) {
      res.writeHead(500, { "Content-Type": "application/json" }).end(
        JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "Payment gate error" }, id: null })
      );
      return;
    }
    if (!gateResult.ok) {
      res.writeHead(gateResult.status, gateResult.headers).end(gateResult.body);
      return;
    }
    if (gateResult.kind === "management") {
      // open/topUp/close: mppx already produced the final answer (a 204 +
      // Payment-Receipt) — diagnose_transaction must not run for these.
      res.writeHead(gateResult.status, gateResult.headers).end(gateResult.body);
      return;
    }
    for (const [key, value] of Object.entries(gateResult.receiptHeaders)) {
      res.setHeader(key, value);
    }

    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    res.on("close", () => {
      transport.close();
      server.close();
    });

    try {
      await server.connect(transport);
      // parsedBody is passed through because the payment gate already
      // buffered and consumed req's body stream to build a Web Request for
      // mppx — handleRequest must not try to read the (now-drained) stream.
      await transport.handleRequest(req, res, gateResult.parsedBody);
    } catch (err) {
      console.error("Error handling MCP HTTP request:", err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" }).end(
          JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null })
        );
      }
    }
  });

  httpServer.listen(port, () => {
    console.error(`${SERVER_NAME} running on streamable HTTP at http://localhost:${port}${MCP_HTTP_PATH}`);
  });
}

async function main() {
  const transportMode = process.env.MCP_TRANSPORT ?? (process.argv.includes("--http") ? "http" : "stdio");

  if (transportMode === "http") {
    await runHttp();
  } else {
    await runStdio();
  }
}

main().catch((err) => {
  console.error(`${SERVER_NAME} failed to start:`, err);
  process.exit(1);
});
