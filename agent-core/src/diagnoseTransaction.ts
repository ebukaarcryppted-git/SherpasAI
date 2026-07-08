import { isHash, type Hash } from "viem";
import {
  findTransactionAcrossChains,
  getGasContext,
  getNonceContext,
  SUPPORTED_CHAINS,
  type TransactionLookup,
} from "@support-agent-asp/onchain-reader";
import type { Diagnosis } from "./types.js";

const SLIPPAGE_HINTS = [
  "insufficient_output_amount",
  "too little received",
  "excessive input amount",
  "price impact too high",
  "slippage",
];

const ALLOWANCE_HINTS = ["allowance", "transfer_from_failed", "insufficient allowance"];

function chainLabel(chainId: number): string {
  return SUPPORTED_CHAINS[chainId]?.name ?? `chain ${chainId}`;
}

/**
 * The core "paste a tx hash, get a diagnosis" flow — the same engine used
 * by the website widget, the MCP tool, and the Discord/Telegram bots.
 *
 * Per Phase 1 spec §2a and Phase 2 spec §1b: chain resolution happens in
 * parallel across all supported chains (Ethereum + X Layer). Whichever
 * chain the tx is actually on is the chain we diagnose against — there is
 * no "expected chain"-vs-"found chain" terminal error path. If the caller
 * supplies `expectedChainId`, it's used only as a tie-breaker when the
 * same hash somehow exists on both chains (rare in practice), not as a
 * filter that turns "found on Ethereum" into a WRONG_NETWORK verdict.
 */
export async function diagnoseTransaction(
  rawHash: string,
  expectedChainId?: number
): Promise<Diagnosis> {
  if (!isHash(rawHash)) {
    return {
      hash: rawHash,
      mode: "not_found",
      chainLabel: null,
      headline: "Hmm, that doesn't look like a transaction hash to me.",
      fix: "A transaction hash is 66 characters long and starts with '0x' — kind of a long random-looking string. Give it another look; usually a stray character got copied or one got dropped when pasting.",
      details: {},
    };
  }

  const hash = rawHash as Hash;
  const crossChain = await findTransactionAcrossChains(hash, expectedChainId);
  // Prefer the search-hinted chain if the caller supplied one AND the tx
  // is found there; otherwise take whichever chain returned a match. Both
  // Ethereum and X Layer are first-class — a hit on either is a real
  // diagnosis target, not an error.
  const primary =
    (expectedChainId !== undefined
      ? crossChain.foundOn.find((r) => r.chainId === expectedChainId)
      : undefined) ?? crossChain.foundOn[0];

  if (!primary) {
    return {
      hash,
      mode: "not_found",
      chainLabel: null,
      headline: "I couldn't track this hash down on Ethereum or X Layer.",
      fix: "First thing worth double-checking is the hash itself — one wrong character is enough to break the lookup. If it's definitely right, chances are it belongs to a different chain we don't cover here yet, so it just won't show up on our side.",
      details: {},
    };
  }

  if (primary.status === "success") {
    return {
      hash,
      mode: "healthy",
      chainLabel: chainLabel(primary.chainId),
      headline: "Good news — this transaction actually went through just fine.",
      fix: "There's nothing broken here for me to fix. If the outcome still feels off to you (like a token amount that seems wrong), it's worth peeking at the event logs on a block explorer — that's where you'll see the actual amounts that ended up moving, which sometimes differs from what you expected because of things like fees or price impact.",
      details: {
        Block: primary.blockNumber?.toString() ?? "unknown",
        "Gas used": primary.gasUsed?.toString() ?? "unknown",
      },
    };
  }

  if (primary.status === "reverted") {
    return diagnoseReverted(primary, chainLabel(primary.chainId));
  }

  if (primary.status === "pending") {
    return diagnosePending(primary, chainLabel(primary.chainId));
  }

  return {
    hash,
    mode: "not_found",
    chainLabel: null,
    headline: "Couldn't determine transaction status.",
    fix: "Try again in a moment, or check the hash on a block explorer directly.",
    details: {},
  };
}

function diagnoseReverted(tx: TransactionLookup, label: string): Diagnosis {
  const reason = tx.revertReason;
  const lower = (reason ?? "").toLowerCase();

  if (SLIPPAGE_HINTS.some((hint) => lower.includes(hint))) {
    return {
      hash: tx.hash,
      mode: "slippage",
      chainLabel: label,
      headline: "This is a classic swap fail — the price shifted while your trade was on its way to the chain, and it moved past what you told your wallet you were okay with.",
      fix: "Two things to try. First, bump your slippage tolerance up when you retry — 1% is a safe starting point, and if the token's really volatile (memecoins, new launches, thin pools) you might need more like 3-5%. Second, if the pool doesn't have much liquidity, breaking the trade into smaller chunks helps a lot — big trades on shallow pools push the price around on their own, which is what triggered this in the first place.",
      details: { "Revert reason": reason ?? "unknown" },
    };
  }

  if (ALLOWANCE_HINTS.some((hint) => lower.includes(hint))) {
    return {
      hash: tx.hash,
      mode: "allowance",
      chainLabel: label,
      headline: "Your wallet hasn't given this contract permission to move that token yet, and that's what tripped things up.",
      fix: "You'll need to hit 'Approve' first — that's actually a separate one-click transaction that lets the contract spend your token on your behalf. Once that approval goes through, retry the swap or transfer you were originally trying to do. Some dApps roll these into one smooth step, but plenty still ask you to approve, wait a beat, then do the real thing.",
      details: { "Revert reason": reason ?? "unknown" },
    };
  }

  return {
    hash: tx.hash,
    mode: "reverted_other",
    chainLabel: label,
    headline: "The transaction hit a snag and got rolled back — basically, the contract said 'nope' and undid everything.",
    fix: reason
      ? `Here's what the contract left behind as a hint: "${reason}". That's usually a sign that some condition it checks — a balance, a permission, an amount, a deadline — didn't hold when your tx tried to run. If it's your own dApp, take a look at the code path that enforces that check; if it's someone else's protocol, this reason is exactly what their support would ask for.`
      : "The contract didn't leave a message about why it refused, which is a little annoying but pretty common with newer or unverified contracts. Best next move: check what your wallet actually sent (data + amounts) against what the target contract expects. A block explorer's 'decode input' feature is your friend here.",
    details: reason ? { "Revert reason": reason } : {},
  };
}

async function diagnosePending(tx: TransactionLookup, label: string): Promise<Diagnosis> {
  if (!tx.from) {
    return {
      hash: tx.hash,
      mode: "pending",
      chainLabel: label,
      headline: "Still processing — the chain hasn't picked it up yet.",
      fix: "Give it another minute or two. If it's been a while, a quick look at a block explorer will tell you whether the whole network is running slow or if it's just this tx that's stuck.",
      details: {},
    };
  }

  const [gas, nonce] = await Promise.all([
    getGasContext(tx.chainId, { gasPrice: tx.gasPrice, maxFeePerGas: tx.maxFeePerGas }),
    getNonceContext(tx.chainId, tx.from, tx.nonce),
  ]);

  if (nonce.hasGap) {
    return {
      hash: tx.hash,
      mode: "nonce_gap",
      chainLabel: label,
      headline: `There's an older transaction of yours sitting in line ahead of this one, and until it goes through nothing behind it can move — including this one.`,
      fix: `Here's the deal: transactions from the same wallet have to confirm in order. Yours got sent with nonce ${tx.nonce}, but nonce ${nonce.latestNonce} still hasn't landed, so this one has to wait its turn. Open your wallet's activity tab, find the pending tx with nonce ${nonce.latestNonce}, and either wait for it, speed it up by resubmitting with higher gas, or cancel it (a common trick: send a 0-value tx to yourself using that same nonce with higher gas — that replaces the stuck one). Once the queue clears, this transaction will get its turn.`,
      details: {
        "Tx nonce": String(tx.nonce),
        "Latest confirmed nonce": String(nonce.latestNonce),
        "Pending nonce": String(nonce.pendingNonce),
      },
    };
  }

  if (gas.underpriced) {
    return {
      hash: tx.hash,
      mode: "gas_too_low",
      chainLabel: label,
      headline: "This one's stuck in the mempool — the gas fee you paid is just below what the network needs right now to include a new tx.",
      fix: `Gas prices move around a lot depending on how busy the chain is, and yours was fine at submission but got outbid. Two easy options: wait it out and hope the network calms down (sometimes it does, sometimes it doesn't), or use your wallet's 'speed up' button to resubmit with higher gas. The current going rate is around ${gas.currentGasPrice.toString()} wei — matching or beating that is what'll get it mined.`,
      details: {
        "Tx gas price": (gas.txMaxFeePerGas ?? gas.txGasPrice ?? BigInt(0)).toString(),
        "Current network gas price": gas.currentGasPrice.toString(),
      },
    };
  }

  return {
    hash: tx.hash,
    mode: "pending",
    chainLabel: label,
    headline: "Still processing — your gas and nonce both look normal, so nothing's actually wrong here.",
    fix: "Just a matter of patience. Sometimes networks get a burst of activity and everything slows down for a few minutes. If it's been way longer than usual for this chain (say, 5+ minutes on X Layer or 10+ minutes on Ethereum during quiet hours), a quick peek at a block explorer will confirm whether the whole network's crawling or if there's something specific going on.",
    details: { Nonce: String(tx.nonce) },
  };
}
