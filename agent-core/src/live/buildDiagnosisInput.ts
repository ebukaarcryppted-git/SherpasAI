import { isHash, type Hash, type Hex } from "viem";
import { X_LAYER_MAINNET_ID } from "@support-agent-asp/onchain-reader";
import type { ClassifyDeps, DiagnosisInput } from "../classify.js";
import { defaultLiveReaders, type LiveReaders } from "./readers.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * A tx that just hasn't propagated to this RPC node yet can look identical
 * to "not found because wrong chain" — the new failure surface Phase 1
 * never had to deal with (spec section 5). If the caller tells us roughly
 * when the tx was submitted and it was very recent, we hold off on the
 * cross-chain wrong-network fallback rather than risk a premature call.
 */
const RECENT_SUBMISSION_GRACE_SECONDS = 15;

export interface BuildDiagnosisInputParams {
  txHash: Hash;
  /** Chain to search the tx on — "where it actually is/was submitted." Defaults to X Layer mainnet. */
  expectedChainId?: number;
  /**
   * Distinct from `expectedChainId`: the chain a dApp/widget *declared* it
   * expects the wallet to be on, when that's known upfront (e.g. an MCP
   * caller that already knows both facts). If given and it differs from
   * the chain the tx is actually found on, this alone is enough for
   * classify.ts's wrong-network rule to fire via its dappContext branch —
   * a direct comparison of two given facts, not the cross-chain search
   * fallback, so it doesn't cost the extra RPC calls that search makes.
   * Defaults to `expectedChainId` when omitted (preserves prior behavior
   * for callers that only ever had one "chain" concept).
   */
  dappExpectedChainId?: number;
  /**
   * Only set this when there's a genuine live wallet-connect signal (the
   * widget knows what chain the user's wallet is actually on right now) —
   * NOT a guess. Leaving it unset lets wrong-network detection fall back to
   * the cross-chain hash search instead, which is the more common case for
   * a bare "paste a tx hash" flow with no connected wallet.
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
   * need the whole thing. Kept out of the classify.ts-shaped `input` so
   * that type stays exactly as the Phase 1 spec defined it.
   */
  rawCalldata?: Hex;
}

/**
 * Assembles a live classify.DiagnosisInput from real onchain-reader calls.
 * This is the whole of what Phase 2 changes per the spec: classify.ts's
 * rules are untouched — only how the input gets built changes, from
 * hand-written fixtures to this.
 */
export async function buildDiagnosisInput(
  params: BuildDiagnosisInputParams
): Promise<BuiltDiagnosisInput> {
  const expectedChainId = params.expectedChainId ?? X_LAYER_MAINNET_ID;

  // Validate before making any RPC call at all. Confirmed live: a malformed
  // hash (e.g. a truncated copy-paste, 62 hex chars instead of 64) sent
  // straight to the RPC produces a JSON-RPC error that turned out to take
  // 90+ seconds to fail through viem/fallback's combined retry layers,
  // instead of the ~2s a well-formed "not found" query takes. Real users
  // will paste truncated/mistyped hashes — failing fast here, before any
  // network call, is the actual fix; tuning RPC retry counts further
  // doesn't reliably bound every error shape a bad request can produce.
  if (!isHash(params.txHash)) {
    return {
      input: {
        tx: {
          hash: params.txHash,
          chainId: expectedChainId,
          status: "not_found",
          from: ZERO_ADDRESS as Hex,
          to: ZERO_ADDRESS as Hex,
          functionSelector: "0x00000000",
          nonce: 0,
          submittedAt: Math.floor(Date.now() / 1000),
        },
        wallet: {
          address: ZERO_ADDRESS as Hex,
          connectedChainId: expectedChainId,
          confirmedNonce: 0,
          pendingNonce: 0,
        },
        networkState: { currentBaseFee: BigInt(0) },
      },
      deps: { crossChainLookup: () => null },
    };
  }

  const readers = { ...defaultLiveReaders, ...params.readers };

  const crossChain = await readers.findTransactionAcrossChains(params.txHash, expectedChainId);
  const primary =
    crossChain.foundOn.find((r) => r.chainId === expectedChainId) ?? crossChain.foundOn[0];

  // Computed here (rather than further down) because the status logic
  // right below needs to know whether a dappContext-based wrong-network
  // check is even available.
  const walletConnectedChainId = params.walletConnectedChainId ?? primary?.chainId ?? expectedChainId;
  const dappExpectedChainId = params.dappExpectedChainId ?? expectedChainId;
  const needsDappContext =
    params.walletConnectedChainId !== undefined ||
    params.dappExpectedChainId !== undefined ||
    params.allowanceCheck?.requiredAllowance !== undefined;

  // Confirmed live bug, fixed here: a tx that succeeded (or reverted) on a
  // DIFFERENT chain than expected must not be reported with its real
  // status *when that's the only way wrong-network detection has to work*.
  // classify.ts's cross-chain-search fallback only ever triggers on
  // status === "not_found" — reporting the real status of wherever we
  // found it would skip that check entirely and let a perfectly successful
  // wrong-chain tx get reported as healthy.
  //
  // BUT — confirmed live as a second, subtler bug — forcing "not_found"
  // this way is actively harmful once `dappContext` is populated: classify.ts's
  // dappContext branch returns unconditionally whenever dappContext exists
  // (match or not), so the cross-chain-search fallback is dead code in that
  // path regardless. Forcing "not_found" there does nothing useful and instead
  // spuriously activates the nonce rule (whose trigger condition includes
  // "not_found") even when the dappContext check independently confirms
  // there's no real wrong-network problem. So: only force "not_found" for
  // the fallback's benefit when there's no dappContext check to rely on instead.
  const foundOnExpectedChain = primary !== undefined && primary.chainId === expectedChainId;
  const status: DiagnosisInput["tx"]["status"] = foundOnExpectedChain
    ? (primary!.status ?? "not_found")
    : needsDappContext
      ? (primary?.status ?? "not_found")
      : "not_found";

  // rpcChainId is where we actually query nonce/gas/allowance from (the
  // real chain the tx lives on, when found elsewhere) — but
  // `input.tx.chainId` must stay `expectedChainId` regardless. classify.ts's
  // wrong-network fallback compares its cross-chain lookup result against
  // `input.tx.chainId` to decide "found somewhere different"; if this field
  // held the *actual* found chain instead, that comparison would always
  // compare a value against itself and never detect a mismatch — a second,
  // subtler version of the same live-confirmed bug as above.
  const rpcChainId = primary?.chainId ?? expectedChainId;
  const walletAddress = primary?.from ?? (ZERO_ADDRESS as Hex);

  const [nonceCtx, gasCtx, allowanceCtx] = await Promise.all([
    primary?.from ? readers.getNonceContext(rpcChainId, primary.from, primary.nonce) : null,
    readers.getGasContext(rpcChainId, { gasPrice: primary?.gasPrice, maxFeePerGas: primary?.maxFeePerGas }),
    params.allowanceCheck && primary?.from
      ? readers.getAllowance(rpcChainId, params.allowanceCheck.token, primary.from, params.allowanceCheck.spender)
      : null,
  ]);

  // See docs/xlayer-onchainos.md: rpc.xlayer.tech's "pending" block tag is
  // confirmed unreliable (returns an already-mined block, not real mempool
  // state). Floor pendingNonce at confirmedNonce+1 rather than trusting the
  // RPC's raw value, so a wallet with more than one legitimately queued tx
  // doesn't get a false NONCE_GAP. This absorbs the single-extra-tx case;
  // it doesn't fully restore real gap detection (documented trade-off).
  const pendingNonce = nonceCtx
    ? Math.max(nonceCtx.pendingNonce, nonceCtx.latestNonce + 1)
    : 0;

  let baseFeeAtSubmission: bigint | undefined;
  if (status === "pending" && params.submittedAtHint !== undefined) {
    baseFeeAtSubmission = (await readers.getBaseFeeAtTimestamp(rpcChainId, params.submittedAtHint)) ?? undefined;
  }

  const input: DiagnosisInput = {
    tx: {
      hash: params.txHash,
      chainId: expectedChainId,
      status,
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

  const deps: ClassifyDeps = {
    crossChainLookup: (hash) => {
      if (recentlySubmitted) return null; // could just be indexing lag, not wrong network — see spec section 5
      const foundElsewhere = crossChain.foundOn.find(
        (r) => r.hash === hash && r.chainId !== expectedChainId
      );
      return foundElsewhere ? foundElsewhere.chainId : null;
    },
  };

  return { input, deps, rawCalldata: primary?.input };
}
