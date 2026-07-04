import { X_LAYER_MAINNET_ID } from "@support-agent-asp/onchain-reader";
import { isHash, type Hash, type Hex } from "viem";
import { diagnose, type Diagnosis } from "../classify.js";
import { buildDiagnosisInput, type BuildDiagnosisInputParams } from "./buildDiagnosisInput.js";
import { buildBridgeInput } from "./buildBridgeInput.js";
import { quantifySlippageV2, type QuantifiedSlippage } from "./quantifySlippage.js";
import { deepenBridgeStuck, type BridgeDeepDiveResult } from "./bridgeDeepDive.js";
import { defaultLiveReaders, type LiveReaders } from "./readers.js";

export interface DiagnoseLiveBridgeParams {
  sourceChainId: number;
  destinationChainId: number;
  destinationTxHash?: Hash;
  recipientAddress?: Hex;
  expectedTimeSeconds: number;
  protocol: string;
}

export interface DiagnoseLiveParams extends Omit<BuildDiagnosisInputParams, "txHash"> {
  txHash: Hash;
  /** Requests bridge-aware diagnosis; the pasted hash is treated as the bridge's source-chain tx. */
  bridge?: DiagnoseLiveBridgeParams;
}

export interface LiveDiagnosis extends Diagnosis {
  /** Only present for a plain (non-bridge) successful tx — classify.ts itself has no "success" mode, since it's a failure classifier. */
  healthy?: boolean;
  /** Only present for SLIPPAGE_REVERT when the swap was a decodable standard V2-style call. */
  quantifiedSlippage?: QuantifiedSlippage;
  /** Only present for BRIDGE_STUCK. */
  bridgeDeepDive?: BridgeDeepDiveResult;
}

/**
 * The Phase 2 entry point: real onchain reads -> classify.diagnose() ->
 * live-only enrichments (quantified slippage, bridge root-causing).
 * classify.ts's rules and priority order are untouched — everything here is
 * either building its input or adding detail on top of its output.
 */
export async function diagnoseLive(params: DiagnoseLiveParams): Promise<LiveDiagnosis> {
  if (!isHash(params.txHash)) {
    return {
      mode: "UNKNOWN_PENDING",
      confidence: 0,
      evidence: {
        note: "That doesn't look like a transaction hash — it should be a 66-character hex string starting with 0x.",
        providedValue: params.txHash,
      },
      ruleTriggered: "diagnoseLive:invalidHashFormat",
    };
  }

  const readers: LiveReaders = { ...defaultLiveReaders, ...params.readers };
  const expectedChainId = params.expectedChainId ?? X_LAYER_MAINNET_ID;
  const { input, deps, rawCalldata } = await buildDiagnosisInput({ ...params, expectedChainId });

  if (params.bridge) {
    const { bridge } = await buildBridgeInput({
      sourceChainId: params.bridge.sourceChainId,
      destinationChainId: params.bridge.destinationChainId,
      sourceTxHash: params.txHash,
      destinationTxHash: params.bridge.destinationTxHash,
      recipientAddress: params.bridge.recipientAddress,
      expectedTimeSeconds: params.bridge.expectedTimeSeconds,
      protocol: params.bridge.protocol,
      readers: { lookupTransactionOnChain: readers.lookupTransactionOnChain },
    });
    input.bridge = bridge;
  }

  // classify.diagnose() runs on the FULL input (dappContext, bridge, etc.)
  // before we ever consider labeling anything "healthy" — a tx that
  // succeeded on the wrong chain, or with a mismatched connected wallet,
  // must still get a chance to trip the wrong-network rule first. An
  // earlier version of this short-circuited on `status === "success"`
  // before calling diagnose() at all, which — confirmed live against a
  // real Ethereum tx queried with expectedChainId set to X Layer — silently
  // reported a wrong-network tx as "no failure detected" instead of
  // WRONG_NETWORK, because the short-circuit never gave classify.ts's own
  // rules a chance to run.
  const diagnosis: LiveDiagnosis = diagnose(input, deps);

  if (
    !params.bridge &&
    input.tx.status === "success" &&
    diagnosis.mode === "UNKNOWN_PENDING" &&
    diagnosis.ruleTriggered === "diagnose:noRuleMatched"
  ) {
    // Nothing in classify.ts fired — the tx really did just succeed cleanly
    // on the expected chain. classify.ts has no explicit "success" mode
    // (it's a failure classifier), so this relabeling happens here instead.
    return {
      mode: "NOT_A_FAILURE",
      confidence: 1,
      evidence: { blockNumber: input.tx.blockNumber, gasUsed: input.tx.gasUsed?.toString() },
      ruleTriggered: "diagnoseLive:successNoRuleMatched",
      healthy: true,
    };
  }

  // Second wrong-network signal (spec section 2): a revert with truly empty
  // data often means the call never reached a require/revert at all — e.g.
  // calling a selector that doesn't exist on this contract. That can mean
  // the contract simply doesn't implement this function, OR that the
  // address means something else entirely on the chain the user meant to
  // use. Attached as a supplementary evidence note rather than a mode
  // override — a missing contract alone isn't as conclusive as the primary
  // rules, so it doesn't get to redirect the classification outright.
  if (input.tx.status === "reverted" && input.tx.revertData === "0x" && input.tx.to) {
    const codeOnExpectedChain = await readers
      .getCode(expectedChainId, input.tx.to as Hex)
      .catch(() => undefined);
    if (!codeOnExpectedChain || codeOnExpectedChain === "0x") {
      diagnosis.evidence = {
        ...diagnosis.evidence,
        possibleWrongNetworkSignal:
          "Revert had no data at all and the target address has no code on this chain — this can mean the contract doesn't exist here and the tx was meant for a different chain.",
      };
    }
  }

  if (
    diagnosis.mode === "SLIPPAGE_REVERT" &&
    input.tx.blockNumber !== undefined &&
    input.tx.to &&
    rawCalldata
  ) {
    // Reference block = the block right before execution. A closer proxy
    // for "what the user's wallet quoted at submission" would use
    // submittedAtHint -> getBlockNumberAtTimestamp, but for a tx that's
    // already mined, blockNumber-1 is the simplest honest reference point
    // without assuming how long it sat in the mempool.
    const referenceBlock = BigInt(input.tx.blockNumber) - BigInt(1);
    const executionBlock = BigInt(input.tx.blockNumber);
    const quantified = await quantifySlippageV2(
      expectedChainId,
      input.tx.to as Hex,
      rawCalldata,
      referenceBlock,
      executionBlock,
      { getAmountsOut: readers.getAmountsOut }
    ).catch(() => null);
    if (quantified) diagnosis.quantifiedSlippage = quantified;
  }

  if (diagnosis.mode === "BRIDGE_STUCK" && params.bridge) {
    const minutesSinceSourceConfirmed =
      typeof diagnosis.evidence.elapsedSeconds === "number"
        ? Math.round(diagnosis.evidence.elapsedSeconds / 60)
        : 0;
    diagnosis.bridgeDeepDive = await deepenBridgeStuck({
      sourceChainId: params.bridge.sourceChainId,
      destinationChainId: params.bridge.destinationChainId,
      minutesSinceSourceConfirmed,
      destinationTxHash: params.bridge.destinationTxHash,
      readers: { lookupTransactionOnChain: readers.lookupTransactionOnChain },
    });
  }

  return diagnosis;
}
