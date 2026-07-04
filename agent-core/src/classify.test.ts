import { describe, expect, it } from "vitest";
import { decodeRevertReason, diagnose } from "./classify.js";
import * as fx from "./classify.fixtures.js";

describe("slippage revert (3.4)", () => {
  it("classifies a decodable Uniswap V3 slippage revert", () => {
    const result = diagnose(fx.slippageDecodable);
    expect(result.mode).toBe("SLIPPAGE_REVERT");
    expect(result.ruleTriggered).toBe("slippage:decodedReason");
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("best-guesses slippage on a generic revert against a known swap selector", () => {
    const result = diagnose(fx.slippageGenericRevert);
    expect(result.mode).toBe("SLIPPAGE_REVERT");
    expect(result.ruleTriggered).toBe("slippage:genericRevertOnSwapSelector");
    expect(result.confidence).toBeCloseTo(0.55);
  });

  it("treats an undecodable custom-error revert the same as no reason at all", () => {
    const result = diagnose(fx.slippageCustomErrorUndecodable);
    expect(result.mode).toBe("SLIPPAGE_REVERT");
    expect(result.ruleTriggered).toBe("slippage:genericRevertOnSwapSelector");
  });
});

describe("insufficient allowance (3.5)", () => {
  it("classifies a decodable ERC20 allowance revert", () => {
    const result = diagnose(fx.allowanceDecodable);
    expect(result.mode).toBe("INSUFFICIENT_ALLOWANCE");
    expect(result.ruleTriggered).toBe("allowance:decodedReason");
  });

  it("infers insufficient allowance from wallet/dapp state when revert isn't decodable", () => {
    const result = diagnose(fx.allowanceInferred);
    expect(result.mode).toBe("INSUFFICIENT_ALLOWANCE");
    expect(result.ruleTriggered).toBe("allowance:inferredFromState");
  });

  it("never mislabels an actual balance shortfall as an allowance problem", () => {
    const result = diagnose(fx.insufficientBalanceNotAllowance);
    expect(result.mode).toBe("INSUFFICIENT_BALANCE");
    expect(result.ruleTriggered).toBe("allowance:actuallyInsufficientBalance");
  });
});

describe("wrong network (3.1)", () => {
  it("classifies a dappContext/wallet chain mismatch with high confidence", () => {
    const result = diagnose(fx.wrongNetworkDappMismatch);
    expect(result.mode).toBe("WRONG_NETWORK");
    expect(result.ruleTriggered).toBe("wrongNetwork:dappContextMismatch");
    expect(result.confidence).toBeCloseTo(0.95);
  });

  it("falls back to a cross-chain lookup when there's no dappContext and the tx isn't found", () => {
    const result = diagnose(fx.wrongNetworkCrossChainFound, fx.wrongNetworkCrossChainDeps);
    expect(result.mode).toBe("WRONG_NETWORK");
    expect(result.ruleTriggered).toBe("wrongNetwork:crossChainFallback");
    expect(result.confidence).toBeCloseTo(0.7);
  });

  it("does not force a wrong-network classification when the fallback lookup finds nothing", () => {
    const result = diagnose(fx.wrongNetworkCrossChainFound, { crossChainLookup: () => null });
    expect(result.mode).not.toBe("WRONG_NETWORK");
  });
});

describe("stuck bridge transaction (3.6)", () => {
  it("classifies BRIDGE_STUCK once elapsed time exceeds the protocol SLA", () => {
    const result = diagnose(fx.bridgePastSla);
    expect(result.mode).toBe("BRIDGE_STUCK");
    expect(result.ruleTriggered).toBe("bridge:exceededWindow");
    expect(result.confidence).toBeCloseTo(0.7);
  });

  it("does NOT classify as stuck while still within the normal transfer window", () => {
    const result = diagnose(fx.bridgeWithinWindow);
    expect(result.mode).toBe("BRIDGE_WITHIN_NORMAL_WINDOW");
    expect(result.ruleTriggered).toBe("bridge:withinWindow");
  });

  it("classifies BRIDGE_SOURCE_NOT_CONFIRMED before ever looking at elapsed time", () => {
    const result = diagnose(fx.bridgeSourceNotConfirmed);
    expect(result.mode).toBe("BRIDGE_SOURCE_NOT_CONFIRMED");
    expect(result.ruleTriggered).toBe("bridge:sourceNotConfirmed");
  });

  it("classifies NOT_A_FAILURE once the destination tx is found, regardless of elapsed time", () => {
    const result = diagnose(fx.bridgeCompleted);
    expect(result.mode).toBe("NOT_A_FAILURE");
    expect(result.ruleTriggered).toBe("bridge:completed");
  });
});

describe("gas underpriced (3.3)", () => {
  it("classifies gas below the current base fee", () => {
    const result = diagnose(fx.gasBelowCurrentBaseFee);
    expect(result.mode).toBe("GAS_UNDERPRICED");
    expect(result.ruleTriggered).toBe("gas:belowCurrentBaseFee");
  });

  it("classifies a fee that was borderline at submission and has since fallen behind", () => {
    const result = diagnose(fx.gasBorderlineAtSubmission);
    expect(result.mode).toBe("GAS_UNDERPRICED");
    expect(result.ruleTriggered).toBe("gas:borderlineAtSubmission");
    expect(result.confidence).toBeCloseTo(0.75);
  });

  it("evaluates legacy gasPrice txs the same way as EIP-1559 maxFeePerGas", () => {
    const result = diagnose(fx.gasLegacyBelowCurrentBaseFee);
    expect(result.mode).toBe("GAS_UNDERPRICED");
    expect(result.ruleTriggered).toBe("gas:belowCurrentBaseFee");
  });

  it("falls through to the orchestrator default (not a crash) when no fee data is present at all", () => {
    const result = diagnose(fx.gasFeeDataMissing);
    expect(result.mode).toBe("UNKNOWN_PENDING");
    expect(result.ruleTriggered).toBe("diagnose:noRuleMatched");
  });
});

describe("nonce issue (3.2)", () => {
  it("classifies a nonce gap when the tx nonce is ahead of the pending nonce", () => {
    const result = diagnose(fx.nonceGapAbovePending);
    expect(result.mode).toBe("NONCE_GAP");
    expect(result.ruleTriggered).toBe("nonce:gap");
  });

  it("classifies an already-used nonce below the confirmed nonce", () => {
    const result = diagnose(fx.nonceAlreadyUsed);
    expect(result.mode).toBe("NONCE_ALREADY_USED");
    expect(result.ruleTriggered).toBe("nonce:alreadyUsed");
  });

  it("also evaluates nonce issues for a not_found tx, not just pending", () => {
    const result = diagnose(fx.nonceAlreadyUsedNotFound);
    expect(result.mode).toBe("NONCE_ALREADY_USED");
    expect(result.ruleTriggered).toBe("nonce:alreadyUsed");
  });
});

describe("negative cases — the classifier must not over-fire", () => {
  it("falls through to UNKNOWN_PENDING when nonce and gas are both correct", () => {
    const result = diagnose(fx.nonceAndGasBothCorrect);
    expect(result.mode).toBe("UNKNOWN_PENDING");
    expect(result.ruleTriggered).toBe("gas:fallbackUnknownPending");
  });

  it("bridge-within-window is never reported as BRIDGE_STUCK", () => {
    const result = diagnose(fx.bridgeWithinWindow);
    expect(result.mode).not.toBe("BRIDGE_STUCK");
  });
});

describe("decodeRevertReason", () => {
  it("decodes a standard Error(string) revert", () => {
    expect(decodeRevertReason(fx.slippageDecodable.tx.revertData)).toBe("Too little received");
  });

  it("returns undefined for a custom-error selector it can't decode", () => {
    expect(decodeRevertReason(fx.slippageCustomErrorUndecodable.tx.revertData)).toBeUndefined();
  });

  it("returns undefined when revertData is absent", () => {
    expect(decodeRevertReason(undefined)).toBeUndefined();
  });

  it("returns undefined for malformed non-hex input rather than throwing", () => {
    expect(decodeRevertReason("not-hex-data")).toBeUndefined();
  });

  it("returns undefined for hex too short to contain a selector", () => {
    expect(decodeRevertReason("0x08c3")).toBeUndefined();
  });
});

describe("priority order (section 2)", () => {
  it("wrong network short-circuits before nonce/gas/slippage checks even run", () => {
    // Reverted tx that WOULD look like a slippage revert, but wallet is on the wrong chain.
    const input = {
      ...fx.slippageDecodable,
      wallet: { ...fx.slippageDecodable.wallet, connectedChainId: 1 },
      dappContext: { expectedChainId: 196 },
    };
    const result = diagnose(input);
    expect(result.mode).toBe("WRONG_NETWORK");
  });

  it("nonce issues are resolved before gas is ever evaluated", () => {
    // Nonce gap AND underpriced gas both present — nonce must win per priority order.
    const input = {
      ...fx.nonceGapAbovePending,
      tx: { ...fx.nonceGapAbovePending.tx, maxFeePerGas: BigInt(1) },
    };
    const result = diagnose(input);
    expect(result.mode).toBe("NONCE_GAP");
  });
});
