import { encodeFunctionData, parseAbi, type Address, type Hex } from "viem";
import type { QuantifiedSlippage } from "./types.js";

const ERC20_APPROVE_ABI = parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]);

/** Builds calldata for an unlimited-approval `approve()` call — the standard one-click fix for insufficient allowance. */
export function buildApproveCalldata(spender: Address, amount: bigint = 2n ** 256n - 1n): Hex {
  return encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: "approve", args: [spender, amount] });
}

const V2_SWAP_ABI = parseAbi([
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)",
]);

/**
 * Rebuilds a Uniswap V2-style swap with a wider slippage tolerance —
 * matches quantifySlippageV2's math on the agent-core side (same
 * basis-points approach) so the retry's new minimum is internally
 * consistent with what the diagnosis card displays.
 */
export function buildRetrySwapCalldata(params: {
  quantified: QuantifiedSlippage;
  recipient: Address;
  /** Extra tolerance added on top of the price movement already observed, in percent. Defaults to 1%. */
  bufferPercent?: number;
  /** Unix seconds; defaults to 20 minutes from now. */
  deadline?: bigint;
}): { calldata: Hex; newAmountOutMin: bigint; newTolerancePercent: number } {
  const bufferPercent = params.bufferPercent ?? 1;
  const expectedOut = BigInt(params.quantified.expectedOutAtReference);
  const amountIn = BigInt(params.quantified.amountIn);

  const newTolerancePercent = params.quantified.priceMovementPercent + bufferPercent;
  const toleranceBasisPoints = BigInt(Math.round(newTolerancePercent * 100));
  const newAmountOutMin = expectedOut - (expectedOut * toleranceBasisPoints) / 10_000n;

  const deadline = params.deadline ?? BigInt(Math.floor(Date.now() / 1000) + 20 * 60);

  const calldata = encodeFunctionData({
    abi: V2_SWAP_ABI,
    functionName: "swapExactTokensForTokens",
    args: [amountIn, newAmountOutMin, params.quantified.path as Address[], params.recipient, deadline],
  });

  return { calldata, newAmountOutMin, newTolerancePercent };
}

/** Bumps a fee (wei) by at least the given percent, and at least 1 wei above the current network price, to satisfy typical replace-by-fee minimums. */
export function bumpFee(currentTxFee: bigint, currentNetworkFee: bigint, bumpPercent = 20): bigint {
  const bumped = (currentTxFee * BigInt(100 + bumpPercent)) / 100n;
  const floor = (currentNetworkFee * 110n) / 100n; // at least 10% above current network price
  return bumped > floor ? bumped : floor;
}
