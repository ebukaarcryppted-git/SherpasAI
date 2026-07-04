# X Layer / OnchainOS Developer Reference

Source: https://web3.okx.com/xlayer/docs/developer/build-on-xlayer/about-xlayer
(mirrored under /onchainos/dev-docs/xlayer/developer/build-on-xlayer/about-xlayer)

Saved locally so the onchain-reader module doesn't need to re-fetch these docs
every session. Re-fetch and update this file only if X Layer's network config
changes (e.g. RPC rotation, chain ID change, upgrade).

## What X Layer is

- Ethereum Layer 2 network built by OKX on an **enhanced Optimism (OP) Stack**
  (previously described in older material as a zkEVM validium — current
  official docs describe it as an OP Stack optimistic rollup with AggLayer
  integration for cross-chain settlement).
- "Full EVM Equivalence" — deploy existing Ethereum contracts/tooling
  unmodified.
- Up to ~20,000 TPS, sub-cent gas fees.
- Native gas token: **OKB** (fixed 21M supply).

## Architecture

- **Virtual machine**: EVM-equivalent.
- **Sequencer**: trusted, implemented via `op-node` in sequencer mode,
  coordinating with `op-reth` over the Engine API. A "Conductor"
  high-availability cluster provides sequencer redundancy (99.9% uptime
  target).
- **Settlement**: OP Stack + AggLayer mode. Cross-chain settlement uses the
  `aggsender`, which prepares certificates and submits them for ZK proof
  generation before L1 verification finalizes state.
- **Security model**: optimistic rollup — transactions assumed valid by
  default, 7-day fraud-proof challenge period for L1 finality, while L2
  itself gives ~1s block time / ~2s soft finality.

### Transaction flow (4 phases)

1. User deposits assets to L1 bridge contracts → Bridge Service monitors and
   mints on L2.
2. Standard L2 execution and withdrawal initiation — Sequencer produces
   blocks, data is persisted for L1 availability.
3. AggLayer cross-chain settlement — `aggsender` prepares certificates,
   submits for ZK proof generation, L1 verifies for finality.
4. Continuous sync between L2 and L1 contract events for consistency.

## Network parameters

### Mainnet
| Param | Value |
|---|---|
| Chain ID | `196` (`0xC4`) |
| RPC | `https://rpc.xlayer.tech` |
| RPC (alt) | `https://xlayerrpc.okx.com` |
| Native currency | OKB (18 decimals) |
| Block explorer | https://www.oklink.com/xlayer |
| Block time | ~1s (post Aug-2025 "PP Upgrade" to OP Stack) |

### Testnet
| Param | Value |
|---|---|
| Chain ID | `1952` (`0x7A0`) |
| RPC | `https://testrpc.xlayer.tech/terigon` |
| RPC (alt) | `https://xlayertestrpc.okx.com/terigon` |
| Native currency | OKB (18 decimals) |
| Block explorer | https://www.oklink.com/xlayer-test |

> Note: an older testnet, chain ID `195` ("X Layer Testnet (Deprecated)"),
> existed pre-upgrade with no live RPCs. Do not use it.

Rate limit: 100 requests/sec per IP on both mainnet and testnet public RPCs.

`eth_getLogs` on `rpc.xlayer.tech` caps the block range to **100 blocks per
call** (confirmed live — a wider range returns `"block range greater than
100 max"`). This is much tighter than most EVM RPCs. Anything that scans
logs (e.g. `onchain-reader/src/approvals.ts`'s Approval-event discovery)
has to page through 100-block chunks rather than requesting one large
range, which bounds how far back it can practically look without an
indexer.

## viem support

viem ships built-in chain definitions — no need to hand-roll a `Chain`
object:

```ts
import { xLayer, xLayerTestnet } from 'viem/chains'
```

> Caveat: viem's default RPC URLs for these chains are
> `xlayerrpc.okx.com` / `xlayertestrpc.okx.com`. Some network environments
> (this dev sandbox included) block `*.okx.com` outbound entirely. The
> `rpc.xlayer.tech` / `testrpc.xlayer.tech/terigon` endpoints serve the same
> chains and are unaffected — the onchain-reader module overrides the
> transport to use them explicitly (see `onchain-reader/src/client.ts`).

## Bridge

- Canonical bridge moves assets L1 <-> X Layer via L1 bridge contracts +
  Bridge Service (deposits) and the AggLayer settlement path (withdrawals).
- Relevant for the "stuck/pending bridge transaction" failure mode in this
  project: a deposit is visible on L1 but not yet reflected on L2 until the
  Bridge Service processes it; a withdrawal is initiated on L2 but not
  final on L1 until the challenge/AggLayer proof path completes.

## The `"pending"` block tag is not trustworthy on `rpc.xlayer.tech`

Confirmed live, not assumed — this directly affects nonce-gap detection
(failure mode 3.2), so it was worth testing before building on it.

Batched `eth_getBlockByNumber(["pending", false])` alongside
`eth_getBlockByNumber(["latest", false])` in a single JSON-RPC request
(removing any timing race between two sequential calls) returned two
**different, already-mined blocks with real (non-null) hashes** — sometimes
`pending`'s block number was *behind* `latest`, sometimes *ahead* of it,
across repeated tests. A real pending/mempool-preview block per the JSON-RPC
spec should have `hash: null` (it hasn't been mined yet) and reflect
currently-queued transactions. Getting a concrete, already-sealed block
instead — inconsistently positioned relative to `latest` — means this RPC's
`"pending"` tag doesn't reflect true mempool state. It's most likely served
by a differently-synced backend node behind the same load-balanced endpoint,
not a real pending-block view.

**Practical consequence:** `eth_getTransactionCount(address, "pending")`
on this RPC cannot be trusted to reflect "confirmed nonce + contiguous
in-flight transactions." A wallet with two or more genuinely sequential
pending transactions (no real gap) can get a false `pendingNonce ===
confirmedNonce` reading, which — fed naively into the nonce-gap rule — would
misclassify the second-or-later pending tx as `NONCE_GAP` when nothing is
actually wrong.

**Mitigation used in `agent-core/src/live/buildDiagnosisInput.ts`:** the
assembler floors `pendingNonce` at `confirmedNonce + 1` before handing it to
the classifier, rather than passing the RPC's raw (possibly-aliased) value
straight through. This absorbs the single-extra-pending-tx case (the most
common real-world pattern) without completely disabling gap detection for
larger jumps (2+ nonces ahead), which remain very unlikely to arise from
ordinary rapid submission and are still flagged. It is a documented
trade-off, not a fix — genuine multi-tx gaps that happen to land exactly one
nonce ahead can still be missed. Full reliability here needs either a real
mempool-aware RPC/indexer or an OnchainOS API with actual pending-state
visibility, neither of which this project currently has wired in.

## OnchainOS market/data APIs

The project brief mentions using "OKX OnchainOS market/data APIs where
available instead of building your own indexer" for chain/mempool context
(e.g. mempool state for the gas-too-low and nonce failure modes). These are
separate from the X Layer RPC docs above — see OKX OnchainOS API docs when
wiring up mempool/market data reads. Not yet fetched/saved locally; revisit
when the onchain-reader needs mempool visibility beyond what a public RPC
exposes (most public RPCs don't expose pending mempool contents directly).
