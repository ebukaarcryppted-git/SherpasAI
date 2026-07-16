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

Returns a `Diagnosis`: `{ mode, confidence, evidence, ruleTriggered, headline, fix, healthy?, quantifiedSlippage?, bridgeDeepDive? }`, as both:
- `content` — a short human-readable text summary (`headline` + `fix`, ready to relay directly)
- `structuredContent` — the full JSON object (for a programmatic caller)

**Annotations:** read-only, non-destructive, idempotent, open-world (touches external RPC state).

## Calling convention: MCP JSON-RPC, or plain HTTP

`/mcp` serves two calling conventions on the same URL, auto-detected per request:

- **Real MCP client** (Claude Desktop, an MCP SDK): send a standard JSON-RPC
  envelope (`{"jsonrpc":"2.0",...}`) — handled by the official
  `@modelcontextprotocol/sdk` transport, unchanged.
- **Plain A2MCP caller** (OKX.AI's marketplace convention, or any HTTP client
  that doesn't speak MCP): send `txHash`/`hash` and optionally
  `chainId`/`expectedChainId` as query params (`GET`) or a plain JSON body
  (any method) — answered directly with the flat `Diagnosis` JSON, no
  envelope required.

Any request body that isn't a JSON-RPC envelope (including a bodyless GET)
is treated as a plain call — see `src/simpleCall.ts`.

## Testing before relying on it

```bash
# 1. Build must be clean
npm run build --workspace=sherpas-support-mcp-server

# 2. Inspect the tool schema and run it manually
npx @modelcontextprotocol/inspector node sherpas-support-mcp-server/dist/index.js

# 3. Manual HTTP smoke test (after starting with `npm run start:http`) — real MCP JSON-RPC
curl -X POST http://localhost:3333/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# 4. Plain A2MCP-style call — same URL, no JSON-RPC envelope
curl "http://localhost:3333/mcp?txHash=0x...&chainId=1"
```

## What this package does NOT do

- No new diagnosis logic — zero new rules, this is pure interface over `agent-core`.
- No `registerResource` — a single stateless tool call fits this use case; there's no persistent resource to expose.

Payment gating (x402, "exact" scheme on X Layer) is handled by
`src/payments/x402Gate.ts` — see the root `README.md`'s
[Payments](../README.md#payments--pay-as-you-go) section and
`docs/asp-registration.md` for the full flow.
