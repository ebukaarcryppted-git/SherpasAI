# SherpasAI

**Know why your onchain transaction failed. In three seconds — not a support ticket.**

SherpasAI (internally: Sherpas Agent ASP) is an autonomous **Agentic Service
Provider (ASP)** that diagnoses failed or stuck onchain transactions by
reading live chain state — not by guessing, and not by asking an LLM to
hallucinate an explanation. Paste a transaction hash, get back a
plain-language diagnosis, the exact evidence that produced it, and — where a
safe fix exists — a one-click wallet action to actually resolve it.

Built for **X Layer**, and also reads Ethereum mainnet. Ships as a rule-based
diagnosis engine, a callable MCP tool any AI agent can pay to use, an
embeddable widget for any dApp, and Discord/Telegram bots.

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

The rule engine classifies onchain transactions into these modes, in
priority order, each backed by a real onchain read:

| Mode | What it means |
|---|---|
| `WRONG_NETWORK` | Tx was sent on a different chain than the wallet/dApp expected — detected via a direct dApp-context comparison or a cross-chain hash search. |
| `NONCE_ALREADY_USED` | A different transaction already confirmed at this nonce. |
| `NONCE_GAP` | An earlier-nonce transaction hasn't confirmed yet, so this one is stuck queued behind it. |
| `GAS_UNDERPRICED` | Fee was below the current network minimum at submission (or has since fallen behind), sitting unmined. |
| `SLIPPAGE_REVERT` | Price moved past the swap's tolerance — quantified with the actual price movement % vs. the tolerance %, decoded straight from pool reserves for standard V2-style swaps. |
| `INSUFFICIENT_ALLOWANCE` | The spender never got (enough) ERC-20 approval — read directly from allowance state. |
| `BRIDGE_SOURCE_NOT_CONFIRMED` | The source-chain leg of a bridge transfer hasn't confirmed yet. |
| `BRIDGE_WITHIN_NORMAL_WINDOW` | Bridge transfer is still inside its documented expected transit time — not actually stuck. |
| `BRIDGE_STUCK` | Past the expected window with no destination-chain landing — deepened further into sub-causes (e.g. past the fraud-proof challenge period, needs manual claim). |
| `NOT_A_FAILURE` | The transaction actually succeeded cleanly — confirms health instead of assuming something's wrong. |
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
| [`sherpas-support-mcp-server`](sherpas-support-mcp-server) | Exposes `diagnose_transaction` as a Model Context Protocol tool over both stdio and streamable HTTP, so any MCP-aware agent (Claude, or a third-party autonomous agent) can call it directly. Gated pay-as-you-go via OKX onchainOS's MPP session protocol — see [Payments](#payments--pay-as-you-go) below. |
| [`widget`](widget) | Embeddable support widget: a React component (npm) or a self-contained script-tag embed for non-React sites. Shadow-DOM isolated so host-page CSS can't leak in or out. Wires real wagmi/viem wallet actions (switch network, speed up, approve, retry-with-adjusted-slippage) for the failure modes that have a genuinely safe one-click fix — and is explicit, never faked, about the ones that don't (nonce conflicts, bridge-stuck). |
| [`bot-adapters/discord`](bot-adapters/discord) & [`bot-adapters/telegram`](bot-adapters/telegram) | Drop a transaction hash into a support channel/chat, get the diagnosis back as a formatted message/embed — same `agent-core` engine underneath. |
| [`website`](website) | Marketing site + a live, real-RPC diagnosis demo, plus `/widget-demo` (interactive fixture-driven demo of every widget failure-mode card) and `/embed` (the raw script-tag embed target). |
| [`docs`](docs) | X Layer/OnchainOS integration notes and the ASP registration/reputation/payments write-up. |

---

## Features

- **Rule-based, not LLM-based diagnosis** — deterministic, fixture-tested,
  priority-ordered classification across 12 failure modes (see table above).
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
- **Pay-as-you-go payments** — the MCP tool is metered and gated via OKX
  onchainOS's real MPP session protocol: an escrow channel opens once, then
  every call is a zero-gas, off-chain signed voucher — no per-call on-chain
  settlement. See [Payments](#payments--pay-as-you-go).
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

`diagnose_transaction` is gated behind OKX onchainOS's real **MPP session**
protocol (an escrow-channel + off-chain-voucher model — the genuine
"Pay-as-you-go" primitive, not a generic one-shot x402 charge):

1. **Open** — a one-time on-chain deposit into a shared MPP escrow contract
   on X Layer, in USD₮0.
2. **Voucher** — every subsequent `diagnose_transaction` call just signs an
   EIP-712 "cumulative spend so far is X" voucher — off-chain, instant,
   zero gas.
3. **Settle/close** — the seller submits the latest voucher on-chain
   whenever it wants to draw funds; any unused deposit refunds on close.

This means:
- **The end user never sees a payment prompt.** The embedding
  protocol funds its own wallet and a small backend proxy
  (`website/app/api/diagnose-proxy`) holds that key server-side, paying on
  the widget's behalf — the private key never touches the browser.
- **Any other agent can pay directly.** Because the gate lives on the MCP
  server itself (not the widget), a third-party autonomous agent that
  discovers this ASP can open its own channel and pay per call — the
  diagnosis tool is a payable primitive any agent can use, not something
  locked inside one product.
- Pricing, channel state, and a simple accounting ledger (payer, amount,
  which diagnosis it paid for) are all real, not mocked — see
  `sherpas-support-mcp-server/src/payments/` and
  `website/lib/payments/`.

Full env var reference: `sherpas-support-mcp-server/.env.example` (seller
side) and `website/.env.example` (the widget-backend payer proxy).

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
- **@okxweb3/mpp** for OKX onchainOS's real MPP session payment protocol
- **Next.js 16** (App Router, Turbopack) for the website
- **discord.js** / **telegraf** for the bot adapters
- **esbuild** for the widget's standalone script-tag bundle

## Supported chains

- **X Layer mainnet** (chain ID `196`) — primary chain; also where MPP
  payment settlement happens
- **X Layer testnet / X1 Testnet** (chain ID `1952`)
- **Ethereum mainnet** (chain ID `1`)

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
