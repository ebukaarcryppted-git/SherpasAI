# sherpas-support-mcp-server

MCP server exposing Sherpas Agent's onchain transaction diagnosis as a single
callable tool: `diagnose_transaction`. This is a thin wrapper — all
classification logic lives in `agent-core`'s `classify.ts` (Phase 1) and
`live` module (Phase 2); this package only handles the MCP protocol surface
(schemas, transports, error shaping). If tool behavior and `classify.ts`
ever disagree, that's a bug here, not a reimplementation choice.

## Install

From the monorepo root (this is an npm workspace):

```bash
npm install
npm run build --workspace=sherpas-support-mcp-server
```

## Run

**stdio** (for Claude Desktop, Claude Code, or local testing):

```bash
npm run start --workspace=sherpas-support-mcp-server
```

**Streamable HTTP** (for a remote MCP client, or the website widget):

```bash
npm run start:http --workspace=sherpas-support-mcp-server
# listens on http://localhost:3333/mcp by default; override with PORT env var
```

## Using it from Claude Desktop

Add to your Claude Desktop MCP config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "sherpas-support": {
      "command": "node",
      "args": ["/absolute/path/to/sherpas-support-mcp-server/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop, then paste a transaction hash into chat — Claude will
call `diagnose_transaction` automatically when it recognizes the request.

## The tool

### `diagnose_transaction`

| Field | Type | Required | Description |
|---|---|---|---|
| `txHash` | string | yes | 66-character `0x`-prefixed transaction hash |
| `chainId` | number | yes | Chain the tx was submitted on (1 = Ethereum, 196 = X Layer) |
| `expectedChainId` | number | no | Chain a dApp expected the wallet to be on — enables wrong-network detection from the two given facts alone, no extra RPC calls |

Returns a `Diagnosis`: `{ mode, confidence, evidence, ruleTriggered, healthy?, quantifiedSlippage?, bridgeDeepDive? }`, as both:
- `content` — a short human-readable text summary (for a chat model relaying the answer)
- `structuredContent` — the full JSON object (for a programmatic caller)

**Annotations:** read-only, non-destructive, idempotent, open-world (touches external RPC state).

## Testing before relying on it

```bash
# 1. Build must be clean
npm run build --workspace=sherpas-support-mcp-server

# 2. Inspect the tool schema and run it manually
npx @modelcontextprotocol/inspector node sherpas-support-mcp-server/dist/index.js

# 3. Manual HTTP smoke test (after starting with `npm run start:http`)
curl -X POST http://localhost:3333/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

## What this package does NOT do

- No new diagnosis logic — zero new rules, this is pure interface over `agent-core`.
- No payment/gating — see `docs/asp-registration.md` at the repo root for that phase.
- No `registerResource` — a single stateless tool call fits this use case; there's no persistent resource to expose.
