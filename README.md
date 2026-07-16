# SherpasAI

**Know why your onchain transaction failed. In three seconds — not a support ticket.**

SherpasAI (internally: Sherpas Agent ASP) is an autonomous **Agentic Service
Provider (ASP)** that diagnoses failed or stuck onchain transactions by
reading live chain state — not by guessing, and not by asking an LLM to
hallucinate an explanation. Paste a transaction hash, get back a
plain-language diagnosis, the exact evidence that produced it, and — where a
safe fix exists — a one-click wallet action to actually resolve it.

Supports **Ethereum mainnet and X Layer mainnet** as two equally first-class
chains — a tx hash is resolved against both in parallel, not searched on one
with the other as a fallback guess. Ships as a rule-based diagnosis engine,
a callable MCP tool any AI agent can pay to use, an embeddable widget for
any dApp, and Discord/Telegram bots.

---

## Why this exists

"My transaction failed and I don't know why" is one of the most common,
highest-friction support requests in Web3. Today it means: open a block
explorer, decode a revert reason by hand, guess whether it's slippage, gas,
nonce, network, allowance, or a bridge that hasn't landed yet — or open a
support ticket and wait for a human. SherpasAI collapses that into an
instant, evidence-backed answer:

- **No hallucination.** A deterministic rule engine classifies the failure
  from real signals (revert data, nonce state, gas vs. base fee, pool
  reserves, bridge timing) — never an LLM guessing at a plausible-sounding
  reason.
- **Evidence, not vibes.** Every diagnosis carries the exact evidence and
  the rule that fired (`ruleTriggered`), so the answer is auditable, not a
  black box.
- **Honest about uncertainty.** Confidence scores are real — low-confidence
  guesses are labeled as guesses, not dressed up as certainty. If nothing
  matches, it says so instead of inventing an answer.
- **Fixes, not just explanations.** For failure modes with a genuinely safe
  one-click remedy (switch network, speed up, approve, retry with adjusted
  slippage), the embeddable widget offers it directly. For everything else
  (nonce conflicts, bridge stuck) it says so honestly instead of faking a
  button that doesn't actually do anything.

---

## What it diagnoses

Chain resolution happens first, before any failure classification: every tx
hash is queried against **all supported chains in parallel** (Ethereum +
X Layer), and the full rule pipeline runs against whichever chain the
transaction is actually found on — not a guessed or hinted-at chain. If a
dApp declared which chain it expected the wallet to be on and that differs
from where the tx actually resolved, that mismatch is attached to the
result as an informational `networkNote` rather than short-circuiting into
a terminal "wrong network" verdict — a transaction that succeeded on a
different chain than expected still gets reported as healthy, with the
chain mismatch noted alongside it, not hidden behind a dead end.

Once resolved, the rule engine classifies the transaction into one of these
modes, in priority order, each backed by a real onchain read:

| Mode | What it means |
|---|---|
| `WRONG_NETWORK` | The wallet's connected chain doesn't match the chain a dApp declared it expected — detected immediately from the two given facts, no extra RPC calls. (Separate from the `networkNote` case above, where the tx itself is simply found on a different chain than hinted.) |
| `NONCE_ALREADY_USED` | A different transaction already confirmed at this nonce. |
| `NONCE_GAP` | An earlier-nonce transaction hasn't confirmed yet, so this one is stuck queued behind it. |
| `GAS_UNDERPRICED` | Fee was below the current network minimum at submission (or has since fallen behind), sitting unmined. |
| `SLIPPAGE_REVERT` | Price moved past the swap's tolerance — quantified with the actual price movement % vs. the tolerance %, decoded straight from pool reserves for standard V2-style swaps. |
| `INSUFFICIENT_ALLOWANCE` | The spender never got (enough) ERC-20 approval — read directly from allowance state. |
| `BRIDGE_SOURCE_NOT_CONFIRMED` | The source-chain leg of a bridge transfer hasn't confirmed yet. |
| `BRIDGE_WITHIN_NORMAL_WINDOW` | Bridge transfer is still inside its documented expected transit time — not actually stuck. |
| `BRIDGE_STUCK` | Past the expected window with no destination-chain landing — deepened further into sub-causes (e.g. past the fraud-proof challenge period, needs manual claim). |
| `NOT_A_FAILURE` | The transaction actually succeeded cleanly — confirms health instead of assuming something's wrong. |
| `REVERTED_OTHER` | Reverted with a reason that isn't one of the specific patterns above — surfaces the decoded revert string (or the raw revert-data selector for custom errors) as evidence, so the caller has something actionable to look up. |
| `UNKNOWN_PENDING` | Nonce and gas both look fine; likely transient network congestion — reported as a low-confidence guess, not a false certainty. |
| `INSUFFICIENT_BALANCE` | Wallet doesn't hold enough of the required asset to cover the transaction. |

---

## Architecture

A TypeScript npm-workspaces monorepo. Every consumer-facing surface (widget,
bots, MCP server) sits on top of the same two core packages, so the
diagnosis logic is written and tested exactly once.

```
                      ┌─────────────────────┐
                      │   onchain-reader     │  raw chain reads: tx/receipt,
                      │  (viem, X Layer +    │  nonce/gas context, allowances,
                      │   Ethereum)          │  bridge status, wallet overview
                      └──────────┬───────────┘
                                 │
                      ┌──────────▼───────────┐
                      │     agent-core        │  classify.ts: pure rule engine
                      │  (classify + live/*)  │  live/*: assembles real reads into
                      │                       │  classify.ts's input, quantifies
                      │                       │  slippage, deepens bridge causes
                      └──────────┬───────────┘
                                 │
        ┌────────────────────────┼─────────────────────────┬───────────────┐
        │                        │                         │               │
┌───────▼────────┐   ┌───────────▼───────────┐   ┌─────────▼──────┐  ┌─────▼─────┐
│ sherpas-support-│   │        widget          │   │  bot-adapters   │  │  website  │
│  mcp-server     │   │ (React component +     │   │ (Discord +      │  │ (Next.js  │
│ (MCP tool,      │   │  script-tag embed,     │   │  Telegram)      │  │  landing +│
│  pay-as-you-go  │   │  Shadow DOM, wallet     │   │                 │  │  live demo│
│  gated)         │   │  actions via wagmi)     │   │                 │  │  + widget │
└─────────────────┘   └────────────────────────┘   └─────────────────┘  │  demo)    │
                                                                          └───────────┘
```

### Package-by-package

| Package | What it is |
|---|---|
| [`onchain-reader`](onchain-reader) | Thin, dependency-light layer over viem: finds a tx across chains, reads nonce/gas/allowance context, checks bridge status, scans wallet approvals, reads wallet balances. RPC calls have retry/backoff and a documented workaround for X Layer's unreliable `"pending"` block tag. |
| [`agent-core`](agent-core) | The actual intelligence. `classify.ts` is a **pure, deterministic function** — fixture-tested, no network calls — that takes a structured `DiagnosisInput` and returns a `Diagnosis`. `live/` wires real `onchain-reader` calls into that input (`diagnoseLive`), adds quantified slippage math and bridge root-cause deepening on top of the classifier's output. |
| [`sherpas-support-mcp-server`](sherpas-support-mcp-server) | Exposes `diagnose_transaction` as a Model Context Protocol tool over both stdio and streamable HTTP, so any MCP-aware agent (Claude, or a third-party autonomous agent) can call it directly. Gated pay-as-you-go via the x402 protocol — see [Payments](#payments--pay-as-you-go) below. |
| [`widget`](widget) | Embeddable support widget: a React component (npm) or a self-contained script-tag embed for non-React sites. Shadow-DOM isolated so host-page CSS can't leak in or out. Wires real wagmi/viem wallet actions (switch network, speed up, approve, retry-with-adjusted-slippage) for the failure modes that have a genuinely safe one-click fix — and is explicit, never faked, about the ones that don't (nonce conflicts, bridge-stuck). |
| [`bot-adapters/discord`](bot-adapters/discord) & [`bot-adapters/telegram`](bot-adapters/telegram) | Drop a transaction hash into a support channel/chat, get the diagnosis back as a formatted message/embed — same `agent-core` engine underneath. |
| [`website`](website) | Marketing site + a live, real-RPC diagnosis demo, plus `/widget-demo` (interactive fixture-driven demo of every widget failure-mode card) and `/embed` (the raw script-tag embed target). |
| [`docs`](docs) | X Layer/OnchainOS integration notes and the ASP registration/reputation/payments write-up. |

---

## Features

- **Rule-based, not LLM-based diagnosis** — deterministic, fixture-tested,
  priority-ordered classification across 13 diagnosis modes (see table above).
- **Live onchain reads** — real RPC calls against X Layer and Ethereum
  mainnet: transaction/receipt lookup, cross-chain hash search, nonce/gas
  context, allowance reads, bridge status, wallet balances and approval
  hygiene scanning.
- **Quantified slippage** — for standard swap calldata, decodes the actual
  price movement and tolerance directly from pool reserves rather than just
  saying "slippage happened."
- **Bridge deep-dive** — root-causes a stuck bridge transfer further (e.g.
  past the documented fraud-proof challenge window, needs manual claim)
  instead of stopping at "still pending."
- **MCP server** — `diagnose_transaction` callable over stdio (for local MCP
  clients) or streamable HTTP (for remote/agent callers), with a full Zod
  input/output schema and dual `content`/`structuredContent` responses.
- **Pay-as-you-go payments** — the MCP tool is metered and gated via the
  **x402** protocol (OKX's `@okxweb3/x402-*` SDK, "exact" scheme on X
  Layer): each call is a standalone upfront payment — 402 challenge, buyer
  signs an EIP-3009 authorization, OKX's facilitator verifies and settles
  on-chain. Required for OKX.AI A2MCP listing compliance — see
  [Payments](#payments--pay-as-you-go).
- **Embeddable widget** — React component or script-tag embed, Shadow-DOM
  isolated, dark near-monochrome design, wallet-connected one-click fixes
  for the failure modes that genuinely have one, honest hedging language
  for low-confidence calls, and passive detection (watches a just-submitted
  tx and proactively offers to check it if it reverts or stalls).
- **Discord + Telegram bots** — the same diagnosis engine, reachable from
  wherever a protocol's support community already lives.
- **Retry/backoff + RPC resilience** — documented X Layer RPC quirks (the
  100-block `eth_getLogs` cap, the unreliable `"pending"` tag) worked
  around explicitly, with fast-fail on malformed input before any network
  call is made.
- **Composability as an ASP** — designed to be *hired*, not just embedded:
  another agent (a protocol's own support bot, or a third-party autonomous
  agent) can call `diagnose_transaction` as a paid sub-task, and this ASP
  itself could call a risk-check ASP before giving wallet-drain advice.

---

## Production hardening

Everything below was added specifically for safe public deployment, not
just local development:

- **Per-IP rate limiting on every live surface** — the website's API routes
  (`/api/diagnose`, `/api/approvals`, `/api/bridge`, `/api/wallet`,
  `/api/diagnose-proxy`) and the MCP server's HTTP transport all cap
  requests per minute per caller, with a proper `429` + `Retry-After`
  response. The MCP server's rate limit sits *ahead of* the payment gate,
  so even an intentionally-ungated deployment (no OKX env vars configured —
  a valid local-dev choice) can't be hammered for free, unlimited,
  RPC-cost-incurring calls.
- **No raw error messages ever reach a caller** — every external-facing
  catch block (API routes, the MCP tool, both bots) routes through a shared
  `safeErrorMessage()` helper: the real error is logged server-side, and
  only a fixed, safe fallback string is returned. This matters specifically
  because RPC client errors (viem's `HttpRequestError`/`TimeoutError`)
  embed the full request URL in their message — including any
  provider-API-key-in-URL (Alchemy/Infura/OnchainOS-style) if you've
  configured a paid RPC endpoint via `ETH_MAINNET_RPC`/`XLAYER_MAINNET_RPC`.
- **Demo-only routes are off by default in production** — `/widget-demo`
  and `/api/mock-mcp` (fixture-driven, fabricated diagnoses for visually
  testing every widget card) return `404` whenever `NODE_ENV=production`
  unless you explicitly set `DEMO_ROUTES_ENABLED=true`.
- **x402 payment flow works end-to-end** on both Ethereum and X Layer,
  round-trip in ~3–4 seconds. Both sides of the flow were switched from
  OKX's MPP session protocol to x402, which is what OKX.AI requires for
  A2MCP-listed paid endpoints. The seller
  (`sherpas-support-mcp-server/src/payments/x402Gate.ts`) settles the
  payment via OKX's facilitator before handing off to the MCP tool — an
  earlier settle-after-serve attempt matching `@okxweb3/x402-express`'s
  buffer-then-replay pattern broke against MCP's `StreamableHTTPServerTransport`
  (which sends response headers via paths `writeHead`/`write`/`end`
  overrides can't intercept, so the post-tool flush crashed with
  `ERR_HTTP_HEADERS_SENT` and left the client hanging). The buyer
  (`website/app/api/diagnose-proxy`, `website/lib/payments/x402Client.ts`)
  signs EIP-3009 authorizations and parses both `application/json` and
  `text/event-stream` MCP responses.

---

## Using it

This README covers what the project is and how it's built. If you want to
integrate it — embed the widget, call it as a paid MCP tool from your own
agent, or run the Discord/Telegram bots — see
**[`docs/USAGE.md`](docs/USAGE.md)**.

---

## Quickstart

```bash
npm install                     # installs all workspaces
npm run build --workspace=onchain-reader
npm run build --workspace=agent-core

# Run the website (landing page + live demo + widget demo)
npm run dev --workspace=website

# Run the MCP server (stdio, for local MCP clients)
npm run dev --workspace=sherpas-support-mcp-server

# Run the MCP server (streamable HTTP, for remote/agent callers)
npm run dev:http --workspace=sherpas-support-mcp-server
```

Run tests across a package:

```bash
npm run test --workspace=agent-core
npm run test --workspace=widget
```

---

## The ASP (Agentic Service Provider)

SherpasAI isn't just an embeddable widget — it's built to stand as an
independently hireable, paid agent on OKX.AI's onchain agent economy.

### Registration & reputation

Registering this ASP with an onchain **ERC-8004 identity on X Layer** (via
OKX's `okx-agent-identity` tooling) gives it an addressable identity other
agents can discover, hire, and rate. Once registered as a Provider and
taking paid calls, a reputation history accrues against that identity
automatically — no separate reputation system to build. See
[`docs/asp-registration.md`](docs/asp-registration.md) for the exact steps
and which MCP tools map to which listed services.

### Payments — pay-as-you-go

`diagnose_transaction` is gated behind the **x402** protocol's "exact"
scheme (OKX's `@okxweb3/x402-*` SDK, X Layer / `eip155:196`) — the standard
OKX.AI requires for A2MCP-listed services:

1. **Challenge** — an unpaid call gets back `402 Payment Required` with a
   payment requirement (price, recipient, token, network).
2. **Pay** — the caller signs a single EIP-3009 `transferWithAuthorization`
   for the exact price and replays the request with the signed payload
   attached — no channel, no persistent state.
3. **Verify + settle** — OKX's facilitator (authenticated via
   `OKX_API_KEY`/`OKX_SECRET_KEY`/`OKX_PASSPHRASE`) verifies the signature
   and submits the on-chain settlement itself — the seller never needs its
   own gas-funded signer wallet.

This means:
- **Any MCP-aware agent can pay directly** — and so can a plain HTTP caller
  that doesn't speak MCP at all. The same `/mcp` URL auto-detects a real MCP
  JSON-RPC envelope vs. a plain call (query params or a plain JSON body,
  matching OKX.AI's own A2MCP marketplace convention) and answers each
  correctly — no separate endpoint needed. See
  [`sherpas-support-mcp-server`'s README](sherpas-support-mcp-server/README.md#calling-convention-mcp-json-rpc-or-plain-http)
  for the exact contract. Because the gate lives on the MCP server itself, a
  third-party autonomous agent that discovers this ASP just needs a wallet
  holding USD₮0 on X Layer — the diagnosis tool is a payable primitive any
  agent can use, not something locked inside one product.
- **No self-managed settlement infrastructure.** Unlike a channel-based
  protocol, the seller doesn't sign or submit anything on-chain itself —
  OKX's facilitator does that, using the seller's own API credentials.
- Pricing and a simple accounting ledger (payer, amount, tx hash) are real,
  not mocked — see `sherpas-support-mcp-server/src/payments/`.

Full env var reference: `sherpas-support-mcp-server/.env.example`.

**Buyer-side note:** the website's own widget-backend proxy
(`website/app/api/diagnose-proxy`, `website/lib/payments/x402Client.ts`)
signs and submits EIP-3009 payments and handles both `application/json`
and `text/event-stream` MCP responses (the transport can pick either).
Paid round-trip runs in ~3–4 seconds against the live deployment.

### Composability

Because it's exposed as a standard MCP tool with a real payment gate, this
ASP composes the same way any priced agent service does: a protocol's own
support bot can hire it as a sub-task for every incoming ticket, or it could
itself call out to a separate risk-check ASP before advising a user to
approve a contract. See `website/components/Composability.tsx` for the
pitch as presented on the site.

---

## Tech stack

- **TypeScript** everywhere, npm workspaces monorepo
- **viem** for all chain reads/writes (no ethers.js)
- **wagmi v2** + **@tanstack/react-query** for the widget's wallet
  connectivity
- **Vitest** for unit tests (fixture-based classifier tests, live-wiring
  tests, voucher-signing interop tests)
- **@modelcontextprotocol/sdk** for the MCP server (dual stdio + streamable
  HTTP transport)
- **@okxweb3/x402-core** / **@okxweb3/x402-evm** for OKX's x402 payment protocol
- **Next.js 16** (App Router, Turbopack) for the website
- **discord.js** / **telegraf** for the bot adapters
- **esbuild** for the widget's standalone script-tag bundle

## Supported chains

- **Ethereum mainnet** (chain ID `1`) and **X Layer mainnet** (chain ID
  `196`) — both diagnosed as equally first-class chains; x402 payment
  settlement happens on X Layer specifically (`eip155:196`), where this
  ASP's price and payout address are configured
- **X Layer testnet / X1 Testnet** (chain ID `1952`) — dev-only convenience,
  not one of the two production chains above

---

## Repository layout

```
onchain-reader/            raw chain-read layer (viem)
agent-core/                classify.ts (pure rules) + live/ (real-read wiring)
sherpas-support-mcp-server/  MCP tool server, dual transport, payment-gated
widget/                     embeddable React component + script-tag embed
bot-adapters/discord/       Discord bot adapter
bot-adapters/telegram/      Telegram bot adapter
website/                    landing page, live demo, widget demo, embed target
docs/                       X Layer/OnchainOS notes, ASP registration guide
```
