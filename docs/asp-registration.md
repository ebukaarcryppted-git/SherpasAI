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
- Services to list: `diagnose_transaction` — the only tool actually exposed
  over MCP (`sherpas-support-mcp-server/src/index.ts` registers just this
  one). Wallet-approval, bridge-status, and wallet-overview reads exist in
  `onchain-reader` and are used by the website's own API routes, but are not
  (yet) exposed as separate MCP tools — don't list them as callable services
  until that changes.
- Endpoint: wherever `sherpas-support-mcp-server`'s HTTP transport ends up
  deployed

Run `/okx-agent-identity` (or ask for it directly) when you're ready — it
needs your wallet to sign the registration transaction.

## 2. Payment settlement (already wired up)

This part is done, not a future decision — `diagnose_transaction` is
metered and gated via OKX onchainOS's **MPP session** protocol (escrow
channel + off-chain signed voucher, not a per-call on-chain charge or a
subscription): `sherpas-support-mcp-server/src/payments/` on the seller
side, `website/lib/payments/` on the buyer side. Current price is $0.03 per
diagnosis in USD₮0 on X Layer (`payments/pricing.ts`). See
[`docs/USAGE.md`'s Payments section](USAGE.md#payments) for the actual
integration flow, and the root README's [Payments —
pay-as-you-go](../README.md#payments--pay-as-you-go) section for the
rationale (MPP over x402 specifically, because a protocol's own support bot
calling this ASP on every ticket amortizes far better as a channel than as
a per-call charge).

## 3. Reputation

Once the identity is registered and taking paid calls, ratings accrue
against it automatically through OKX.AI's agent rating system — nothing
extra to build here. The composability pitch (this ASP being hired as a
sub-task by a protocol's own support agent, or itself calling a risk-check
ASP before giving wallet-drain advice — see `components/Composability.tsx`
on the website) depends on this identity existing, since that's what other
agents look up to decide whether to hire it.

## What's already built vs. what registration adds

| Already built | Registration (this doc) adds |
|---|---|
| Diagnosis logic (`agent-core`) | Onchain identity other agents can discover |
| Callable interface (`sherpas-support-mcp-server`) | Reputation history |
| Metered payment per call (MPP session) | Discoverability in the OKX.AI agent marketplace |
| Embeddable UI (`widget`, `/embed`) | |
| Discord/Telegram integration | |
