# Using Sherpas Agent ASP

This is the practical "how do I actually use this" guide. For what the
project is and why it exists, read the [root README](../README.md) first —
this doc assumes you've read it and just want to integrate.

There are four ways to use Sherpas Agent ASP, depending on who you are:

| You are... | Use this |
|---|---|
| Someone who just wants a diagnosis right now | [Live demo](#1-try-it-live) |
| A dApp/protocol wanting a support widget on your own site | [Embed the widget](#2-embed-the-widget-in-your-dapp) |
| An AI agent or backend that wants to call diagnosis as a paid tool | [Call it as an MCP tool](#3-call-it-as-a-paid-mcp-tool) |
| A community wanting the bot in your Discord/Telegram | [Run the bots](#4-run-the-discordtelegram-bots) |

---

## 1. Try it live

Paste a transaction hash at the live site and get a diagnosis with no setup:
**https://sherpasagent.xyz**

This calls the site's own live-demo API routes (`/api/diagnose`,
`/api/approvals`, `/api/bridge`, `/api/wallet`), which read real chain state
directly — no payment required for this path, since it's the project's own
demo surface, not the metered MCP tool described below.

---

## 2. Embed the widget in your dApp

The `@support-agent-asp/widget` package ships two ways to mount the same
`SupportWidget` component, so it works whether or not your site is React.

### Script tag (any site, no React required)

```html
<script
  src="https://your-cdn/widget.js"
  data-chain-id="196"
  data-mcp-endpoint="https://your-mcp-server.example.com/mcp"
  data-support-url="https://your-support-page.example.com"
  data-supported-chain-ids="1,196"
></script>
```

- `data-chain-id` (required) — the chain your dApp expects the user's wallet
  to be on. Used for wrong-network detection and as the switch-network
  target.
- `data-mcp-endpoint` (required) — URL of a running `sherpas-support-mcp-server`
  HTTP transport (self-hosted — see [§3](#3-call-it-as-a-paid-mcp-tool)), or
  your own backend proxy that pays on the user's behalf (see
  [Payments](#payments) below).
- `data-support-url` (optional) — a fallback link shown when the widget can't
  offer an automated fix.
- `data-supported-chain-ids` (optional) — comma-separated chain IDs the
  widget will accept; defaults to Ethereum + X Layer.

The widget mounts as a fixed bottom-right overlay in a Shadow DOM, so your
page's CSS can't leak in or out. Build your own copy of the embed bundle with
`npm run build:embed --workspace=widget` (outputs via `esbuild.embed.mjs`).

### React component (npm package)

```tsx
import { SupportWidget } from "@support-agent-asp/widget";

<SupportWidget
  expectedChainId={196}
  mcpEndpoint="https://your-mcp-server.example.com/mcp"
  supportUrl="https://your-support-page.example.com"
  supportedChainIds={[1, 196]}
/>
```

Your app must already be wrapped in a `WagmiProvider` + `QueryClientProvider`
— the component assumes one exists (unlike the script-tag path, which
bootstraps a minimal one itself).

---

## 3. Call it as a paid MCP tool

`sherpas-support-mcp-server` exposes a single tool, `diagnose_transaction`,
over the [Model Context Protocol](https://modelcontextprotocol.io) — any
MCP-aware agent (Claude, or your own autonomous agent) can call it directly.

### Self-host the server

There is currently no shared public MCP endpoint for third parties — run
your own:

```bash
git clone https://github.com/ebukaarcryppted-git/SherpasAI.git
cd SherpasAI
npm install
npm run build --workspace=onchain-reader
npm run build --workspace=agent-core
npm run build --workspace=sherpas-support-mcp-server

# stdio (local MCP clients — Claude Desktop, Claude Code)
npm run start --workspace=sherpas-support-mcp-server

# streamable HTTP (remote/agent callers, the widget)
npm run start:http --workspace=sherpas-support-mcp-server
# listens on http://localhost:3333/mcp by default; override with PORT
```

Deploy the HTTP mode anywhere that keeps a Node process alive (a small VM,
Railway, Fly.io) — **not** a serverless platform like Vercel, unless you
first swap the file-backed payment channel store
(`sherpas-support-mcp-server`'s payment session state) for a real shared
datastore. See the [root README's Production hardening
section](../README.md#production-hardening) for why.

### Call the tool directly

This is real MCP JSON-RPC over HTTP, not a REST shortcut:

```bash
curl -X POST http://localhost:3333/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "diagnose_transaction",
      "arguments": {
        "txHash": "0x...",
        "chainId": 196,
        "expectedChainId": 1
      }
    }
  }'
```

**Arguments:**

| Field | Type | Required | Description |
|---|---|---|---|
| `txHash` | string | yes | 66-character `0x`-prefixed transaction hash |
| `chainId` | number | yes | Chain the tx was submitted on (`1` = Ethereum, `196` = X Layer) |
| `expectedChainId` | number | no | Chain your dApp expected the wallet to be on — enables wrong-network detection from these two facts alone, no extra RPC calls |

The response comes back as both `content` (a short text summary, for a chat
model relaying the answer) and `structuredContent` (the full JSON
`Diagnosis` object, for a programmatic caller). Example `structuredContent`:

```json
{
  "mode": "SLIPPAGE_REVERT",
  "confidence": 0.92,
  "ruleTriggered": "slippage-revert-quantified",
  "evidence": { "...": "..." },
  "quantifiedSlippage": {
    "priceMovementPercent": 3.4,
    "slippageTolerancePercent": 1.0,
    "path": ["0x...", "0x..."],
    "amountIn": "1000000000000000000",
    "amountOutMin": "...",
    "expectedOutAtReference": "...",
    "actualOutAtExecution": "..."
  }
}
```

See the [root README's failure-mode table](../README.md#what-it-diagnoses)
for every possible `mode` value.

---

## Payments

`diagnose_transaction` is gated behind the **x402** protocol's "exact"
scheme — a standalone upfront payment per call (402 challenge, buyer signs
an EIP-3009 authorization, OKX's facilitator verifies and settles
on-chain), not a channel or subscription. Current price: **$0.03 per
diagnosis**, in USD₮0 on X Layer (`sherpas-support-mcp-server/src/payments/pricing.ts`).
This is the scheme OKX.AI requires for A2MCP-listed services specifically —
see [`docs/asp-registration.md`](asp-registration.md).

If the server operator hasn't set the four required env vars (see
`sherpas-support-mcp-server/.env.example`), the tool serves **ungated and
free** — this is a valid choice for local dev or a private deployment, but
it's on you as the operator to decide whether to gate a public one.

To pay and call a gated server from your own agent, use OKX's x402 client
SDK (`@okxweb3/x402-core/client` + `@okxweb3/x402-evm`'s `ExactEvmScheme`):
sign an EIP-3009 `transferWithAuthorization` for the exact price, attach it
to the retried request, and the server verifies + settles before serving
the diagnosis. No channel to open, no persistent client-side state.

**Known gap:** the website's own buyer-side proxy
(`website/app/api/diagnose-proxy`, `website/lib/payments/`) still speaks
the older MPP session protocol as of this writing and hasn't yet been
updated to match — it isn't a working x402 reference implementation right
now. Treat the OKX SDK's own client examples as the source of truth until
that's rewritten.

---

## 4. Run the Discord/Telegram bots

Both bots share the exact same diagnosis engine as everything else — no
separate deployment of agent-core needed, they call it directly.

### Discord

1. Create an application + bot at
   [discord.com/developers/applications](https://discord.com/developers/applications),
   copy the bot token and application (client) ID.
2. Register slash commands:
   ```bash
   cd bot-adapters/discord
   DISCORD_TOKEN=... DISCORD_CLIENT_ID=... npm run deploy-commands
   ```
   Add `DISCORD_GUILD_ID` to register instantly to one server while
   developing — global registration can take up to an hour to propagate.
3. Invite the bot to your server with the `applications.commands` and `bot`
   scopes, `Send Messages` + `Embed Links` permissions:
   ```
   https://discord.com/oauth2/authorize?client_id=<YOUR_CLIENT_ID>&scope=bot%20applications.commands&permissions=84992
   ```
4. Start it: `DISCORD_TOKEN=... npm run dev` (or `npm run build && npm start`).

Commands: `/diagnose tx_hash:0x...`, `/approvals address:0x... tokens:0x...,0x...`,
`/bridge tx_hash:0x... recipient:0x...`. Anyone pasting a bare 66-character
tx hash in a channel the bot can see also gets an automatic reply — no
command needed.

### Telegram

1. Message [@BotFather](https://t.me/BotFather), `/newbot`, copy the token.
2. `TELEGRAM_BOT_TOKEN=... npm run dev` (or `npm run build && npm start`).

Commands: `/diagnose <tx_hash>`, `/approvals <address> <token1,token2>`,
`/bridge <tx_hash> <recipient>`. A bare tx hash sent as a plain message
triggers the same auto-diagnosis.

### Deploying either one long-term

Both are long-running processes (`bot.launch()` / Discord gateway
connection), not serverless functions. Deploy on anything that keeps a Node
process alive — this project runs both on [Railway](https://railway.app), one
service per bot, each with its own root-level `railway.json`
(`bot-adapters/discord/railway.json`, `bot-adapters/telegram/railway.json`)
declaring the workspace-ordered build command
(`onchain-reader` → `agent-core` → the bot itself) and start command. Two
things matter for a clean Railway deploy:

- **Leave each service's Root Directory unset (repo root)** — narrowing it to
  the bot's subfolder breaks npm's workspace resolution, since `agent-core`
  is a local workspace link, not a published npm package.
- **Point each service's Custom Config File Path at its own `railway.json`**
  (e.g. `/bot-adapters/discord/railway.json`) — Railway doesn't support
  per-service overrides in a single root config file for a monorepo with
  multiple services.

---

## Chains supported everywhere above

| Chain | ID | Notes |
|---|---|---|
| Ethereum mainnet | `1` | |
| X Layer mainnet | `196` | x402 payment settlement happens here specifically |
| X Layer testnet | `1952` | Dev-only convenience |

## Rate limits & errors

Every live surface (website API routes, MCP server HTTP transport) caps
requests per minute per caller and returns `429` + `Retry-After` once
exceeded. No raw internal error ever reaches a caller — you'll always get a
fixed, safe error string back, never a stack trace or an RPC URL (which
could otherwise leak a provider API key). If you need more detail than that
for debugging your own integration, run the server yourself and read its
logs.

## Getting help

- Full architecture, failure-mode reference, and tech stack: [root README](../README.md)
- Registering this ASP with an onchain identity / reputation: [`docs/asp-registration.md`](asp-registration.md)
- X Layer network/RPC quirks referenced above: [`docs/xlayer-onchainos.md`](xlayer-onchainos.md)
- Issues/bugs: open an issue on the [GitHub repo](https://github.com/ebukaarcryppted-git/SherpasAI)
