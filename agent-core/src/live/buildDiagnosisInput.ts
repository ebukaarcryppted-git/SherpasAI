import { isHash, type Hash, type Hex } from "viem";
import { X_LAYER_MAINNET_ID } from "@support-agent-asp/onchain-reader";
import type { ClassifyDeps, DiagnosisInput, NetworkNote } from "../classify.js";
import { defaultLiveReaders, type LiveReaders } from "./readers.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * A tx that just hasn't propagated to this RPC node yet can look identical
 * to "not found because wrong chain" — the new failure surface Phase 1
 * never had to deal with (Phase 2 spec §5). If the caller tells us roughly
 * when the tx was submitted and it was very recent, we hold off on the
 * cross-chain wrong-network fallback rather than risk a premature call.
 */
const RECENT_SUBMISSION_GRACE_SECONDS = 15;

export interface BuildDiagnosisInputParams {
  txHash: Hash;
  /**
   * Search-chain hint — where to START looking. Under Phase 2 spec §1b, the
   * reader queries ALL supported chains in parallel regardless (via
   * `findTransactionAcrossChains`), so this hint only affects tie-breaks
   * when the tx isn't found anywhere. Defaults to X Layer mainnet.
   */
  expectedChainId?: number;
  /**
   * The dApp's declared expectation of which chain the tx SHOULD be on.
   * Distinct from `expectedChainId` (which is a search hint, not a
   * declaration). When the resolved chain differs from this value,
   * `buildDiagnosisInput` populates `networkNote` for the pipeline caller
   * to attach to the final Diagnosis (Phase 1 spec §2a). Defaults to
   * `expectedChainId` for backward-compat with callers that only ever
   * had one "chain" concept.
   */
  dappExpectedChainId?: number;
  /**
   * Only set this when there's a genuine live wallet-connect signal (the
   * widget knows what chain the user's wallet is actually on right now) —
   * NOT a guess. When unset, `wallet.connectedChainId` defaults to the
   * resolved chain (honest: "no wallet signal, treating the wallet as if
   * it's on whatever chain the tx is on").
   */
  walletConnectedChainId?: number;
  allowanceCheck?: { token: Hex; spender: Hex; requiredAllowance?: bigint };
  /** Caller's best knowledge of when the tx was submitted (unix seconds) — improves gas/nonce timing checks and indexing-lag handling. Best-effort; omit if unknown. */
  submittedAtHint?: number;
  readers?: Partial<LiveReaders>;
}

export interface BuiltDiagnosisInput {
  input: DiagnosisInput;
  /** Pass straight through as classify.diagnose()'s second argument. */
  deps: ClassifyDeps;
  /**
   * Full calldata, not just the derived functionSelector on `input.tx` —
   * classify.ts only needs the selector, but live-only enrichments (e.g.
   * quantified slippage, which has to decode amountIn/amountOutMin/path)
   * need the whole thing.
   */
  rawCalldata?: Hex;
  /**
   * The chain the tx was actually found on (per Phase 2 spec §1b's parallel
   * cross-chain resolution). Falls back to `expectedChainId` when the tx
   * isn't found anywhere.
   */
  resolvedChainId: number;
  /**
   * Populated when `dappExpectedChainId` was given AND differs from the
   * resolved chain. The pipeline caller (diagnoseLive) attaches this
   * verbatim onto the final Diagnosis — informational, per Phase 1 spec
   * §2a; the diagnosis itself still reflects what actually happened on the
   * resolved chain.
   */
  networkNote?: NetworkNote;
}

/**
 * Assembles a live classify.DiagnosisInput from real onchain-reader calls.
 *
 * Under Phase 1 spec §2a and Phase 2 spec §1b, this is now the piece that
 * does *chain resolution*: it accepts a bare tx hash, resolves which
 * supported chain it actually lives on (via `findTransactionAcrossChains`,
 * which queries all supported chains in parallel), and builds the
 * DiagnosisInput from THAT chain's real data — honestly, without forcing
 * the status or lying about the tx.chainId. `classify.ts`'s rules then
 * diagnose whatever actually happened on that chain, and if the dApp
 * expected a different chain, that mismatch is returned as a `networkNote`
 * for the caller to attach — NOT as a terminal WRONG_NETWORK verdict that
 * skips the real diagnosis (the bug Phase 1 spec §2b describes).
 */
export async function buildDiagnosisInput(
  params: BuildDiagnosisInputParams
): Promise<BuiltDiagnosisInput> {
  const searchChainId = params.expectedChainId ?? X_LAYER_MAINNET_ID;

  // Validate before making any RPC call at all. Confirmed live: a malformed
  // hash (e.g. a truncated copy-paste, 62 hex chars instead of 64) sent
  // straight to the RPC produced a JSON-RPC error that took 90+ seconds to
  // fail through viem/fallback's combined retry layers. Failing fast here
  // is the actual fix; tuning RPC retry counts further doesn't reliably
  // bound every error shape a bad request can produce.
  if (!isHash(params.txHash)) {
    return {
      input: {
        tx: {
          hash: params.txHash,
          chainId: searchChainId,
          status: "not_found",
          from: ZERO_ADDRESS as Hex,
          to: ZERO_ADDRESS as Hex,
          functionSelector: "0x00000000",
          nonce: 0,
          submittedAt: Math.floor(Date.now() / 1000),
        },
        wallet: {
          address: ZERO_ADDRESS as Hex,
          connectedChainId: searchChainId,
          confirmedNonce: 0,
          pendingNonce: 0,
        },
        networkState: { currentBaseFee: BigInt(0) },
      },
      deps: { crossChainLookup: () => null },
      resolvedChainId: searchChainId,
    };
  }

  const readers = { ...defaultLiveReaders, ...params.readers };

  // Phase 2 spec §1b: parallel resolution across all supported chains. The
  // reader implementation already does this via Promise.all — we just take
  // its result and pick whichever chain reports the tx as found.
  const crossChain = await readers.findTransactionAcrossChains(params.txHash, searchChainId);

  // Prefer the search-hinted chain if the tx is found there, otherwise
  // take whichever chain did find it. This makes the search hint useful
  // (deterministic tie-break when the same hash somehow exists on both
  // chains — rare in practice, but not theoretically impossible) without
  // treating it as a terminal filter.
  const primary =
    crossChain.foundOn.find((r) => r.chainId === searchChainId) ?? crossChain.foundOn[0];
  const foundAnywhere = primary !== undefined;
  const resolvedChainId = primary?.chainId ?? searchChainId;

  const dappExpectedChainId = params.dappExpectedChainId ?? searchChainId;
  const dappChainMismatch =
    params.dappExpectedChainId !== undefined &&
    foundAnywhere &&
    resolvedChainId !== dappExpectedChainId;

  // Honest wallet defaults: if the caller has no wallet-connect signal, the
  // wallet is treated as being on whatever chain we resolved the tx to.
  // That means the dappContext.expectedChainId check (still exported as a
  // pure rule, but no longer part of diagnose()'s pipeline) doesn't fire
  // spuriously just because we didn't know where the wallet was.
  const walletConnectedChainId = params.walletConnectedChainId ?? resolvedChainId;

  const needsDappContext =
    params.walletConnectedChainId !== undefined ||
    params.dappExpectedChainId !== undefined ||
    params.allowanceCheck?.requiredAllowance !== undefined;

  const walletAddress = primary?.from ?? (ZERO_ADDRESS as Hex);

  const [nonceCtx, gasCtx, allowanceCtx] = await Promise.all([
    primary?.from ? readers.getNonceContext(resolvedChainId, primary.from, primary.nonce) : null,
    readers.getGasContext(resolvedChainId, { gasPrice: primary?.gasPrice, maxFeePerGas: primary?.maxFeePerGas }),
    params.allowanceCheck && primary?.from
      ? readers.getAllowance(resolvedChainId, params.allowanceCheck.token, primary.from, params.allowanceCheck.spender)
      : null,
  ]);

  // See docs/xlayer-onchainos.md: rpc.xlayer.tech's "pending" block tag is
  // confirmed unreliable (returns an already-mined block, not real mempool
  // state). Floor pendingNonce at confirmedNonce+1 rather than trusting the
  // RPC's raw value, so a wallet with more than one legitimately queued tx
  // doesn't get a false NONCE_GAP.
  const pendingNonce = nonceCtx
    ? Math.max(nonceCtx.pendingNonce, nonceCtx.latestNonce + 1)
    : 0;

  let baseFeeAtSubmission: bigint | undefined;
  if (primary?.status === "pending" && params.submittedAtHint !== undefined) {
    baseFeeAtSubmission = (await readers.getBaseFeeAtTimestamp(resolvedChainId, params.submittedAtHint)) ?? undefined;
  }

  const input: DiagnosisInput = {
    tx: {
      hash: params.txHash,
      // The tx's chainId is the chain it ACTUALLY lives on, not the chain
      // someone hinted at. Phase 1 spec §2a: chain resolution runs before
      // the priority pipeline and its result is what the pipeline reasons
      // against.
      chainId: resolvedChainId,
      status: primary?.status ?? "not_found",
      from: walletAddress,
      to: primary?.to ?? (ZERO_ADDRESS as Hex),
      functionSelector: primary?.input && primary.input.length >= 10 ? primary.input.slice(0, 10) : "0x00000000",
      nonce: primary?.nonce ?? 0,
      maxFeePerGas: primary?.maxFeePerGas,
      gasPrice: primary?.gasPrice,
      gasUsed: primary?.gasUsed,
      revertData: primary?.rawRevertData,
      blockNumber: primary?.blockNumber !== undefined ? Number(primary.blockNumber) : undefined,
      // Best-effort: raw RPC has no record of true mempool submission time.
      // A caller-supplied hint is preferred; otherwise "now" is a
      // placeholder, not a reconstruction of actual submission time.
      submittedAt: params.submittedAtHint ?? Math.floor(Date.now() / 1000),
    },
    wallet: {
      address: walletAddress,
      connectedChainId: walletConnectedChainId,
      confirmedNonce: nonceCtx?.latestNonce ?? 0,
      pendingNonce,
      tokenAllowance: allowanceCtx?.allowance,
    },
    dappContext: needsDappContext
      ? { expectedChainId: dappExpectedChainId, requiredAllowance: params.allowanceCheck?.requiredAllowance }
      : undefined,
    networkState: {
      currentBaseFee: gasCtx.currentBaseFeePerGas ?? gasCtx.currentGasPrice,
      baseFeeAtSubmission,
    },
  };

  const recentlySubmitted =
    params.submittedAtHint !== undefined &&
    Math.floor(Date.now() / 1000) - params.submittedAtHint < RECENT_SUBMISSION_GRACE_SECONDS;

  // deps.crossChainLookup is retained for callers that use classifyWrongNetwork
  // directly (it's no longer part of diagnose()'s pipeline, per Phase 1 spec
  // §2a). Same "recent submission = don't call wrong-network yet" guard.
  const deps: ClassifyDeps = {
    crossChainLookup: (hash) => {
      if (recentlySubmitted) return null;
      const foundElsewhere = crossChain.foundOn.find(
        (r) => r.hash === hash && r.chainId !== searchChainId
      );
      return foundElsewhere ? foundElsewhere.chainId : null;
    },
  };

  const networkNote: NetworkNote | undefined = dappChainMismatch
    ? {
        foundOn: resolvedChainId,
        expected: dappExpectedChainId,
        message: `This transaction is on chain ${resolvedChainId}, not ${dappExpectedChainId} — the diagnosis below reflects what actually happened on chain ${resolvedChainId}.`,
      }
    : undefined;

  return { input, deps, rawCalldata: primary?.input, resolvedChainId, networkNote };
}
