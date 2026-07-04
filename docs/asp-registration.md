# Making this a hireable, pay-per-call ASP with onchain reputation

The diagnosis engine (`agent-core` + `mcp-server`) is what makes this
callable. Being a *hireable ASP with onchain reputation* on OKX.AI is a
separate, deliberate step on top of that: it means registering an onchain
identity, exposing this as a paid endpoint, and letting a reputation history
accrue against that identity. That step needs your wallet/keys and a
decision about fees — it isn't something to do automatically, so it's
documented here rather than executed inline.

## 1. Register an ERC-8004 agent identity on X Layer

OKX.AI's agent identity system (ERC-8004) is what gives an ASP an onchain,
addressable identity other agents can look up, rate, and build reputation
against. This repo's `okx-agent-identity` skill handles registration,
updates, activation/deactivation, and avatar upload.

To register this agent as an ASP:
- Role: **ASP / Provider** (not User, not Evaluator)
- Services to list: `diagnose_transaction`, `check_wallet_approvals`,
  `check_bridge_status`, `get_wallet_overview` — these map directly to the
  MCP tools in `mcp-server/src/index.ts`
- Endpoint: wherever `mcp-server` (or an HTTP wrapper around it) ends up
  deployed

Run `/okx-agent-identity` (or ask for it directly) when you're ready — it
needs your wallet to sign the registration transaction.

## 2. Wire up payment settlement

Once registered, calls to this ASP get metered and paid via OKX.AI's Agent
Payments Protocol (x402 / MPP), not a subscription. The `okx-agent-payments-protocol`
skill covers the flows relevant here:
- **x402 (exact or upto)**: simplest fit for "pay per diagnosis" — a
  caller's request to `diagnose_transaction` gets a 402 + payment
  requirement, they pay, the call proceeds.
- **MPP session/channel**: better fit if a protocol's own support bot is
  going to call this ASP frequently (e.g. every ticket) — open a channel
  once, settle in batches instead of per-call.

Flat fee per diagnosis (as scoped in the original project brief) maps
cleanly onto x402 `exact`. Start there; move to MPP only if per-call
overhead becomes a real cost at volume.

## 3. Reputation

Once the identity is registered and taking paid calls, ratings accrue
against it automatically through OKX.AI's agent rating system — nothing
extra to build here. The composability pitch (this ASP being hired as a
sub-task by a protocol's own support agent, or itself calling a risk-check
ASP before giving wallet-drain advice — see `components/Composability.tsx`
on the website) depends on this identity existing, since that's what other
agents look up to decide whether to hire it.

## What's already built vs. what this step adds

| Already built | This step adds |
|---|---|
| Diagnosis logic (`agent-core`) | Onchain identity other agents can discover |
| Callable interface (`mcp-server`) | Metered payment per call |
| Embeddable UI (`widget`, `/embed`) | Reputation history |
| Discord/Telegram integration | Discoverability in the OKX.AI agent marketplace |
