import { decodeFunctionData, parseAbi, type Hex } from "viem";
import { getClient } from "@support-agent-asp/onchain-reader";

/**
 * Standard IUniswapV2Router02 fragments — stable across every V2 fork
 * (Uniswap, Pancake, Sushi, QuickSwap, etc.), so this works without knowing
 * which specific fork the router belongs to. Deliberately router-only: we
 * never need a pair/factory address (which would require per-fork
 * addresses not in the verified reference table) because `getAmountsOut`
 * already resolves the pair internally via the router's own known factory.
 */
export const V2_ROUTER_ABI = parseAbi([
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)",
  "function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)",
  "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)",
]);

export interface QuantifiedSlippage {
  path: Hex[];
  amountIn: bigint;
  amountOutMin: bigint;
  /** What the router would have quoted at the reference (near-submission) block. */
  expectedOutAtReference: bigint;
  /** What the router actually would have paid out at the execution block — the number that fell below amountOutMin. */
  actualOutAtExecution: bigint;
  /** How far the price moved against the user between reference and execution, as a percentage. Negative means price moved in their favor. */
  priceMovementPercent: number;
  /** The tolerance implied by amountOutMin relative to the reference-block quote. */
  slippageTolerancePercent: number;
}

export interface QuantifySlippageReaders {
  getAmountsOut: (
    chainId: number,
    router: Hex,
    amountIn: bigint,
    path: readonly Hex[],
    blockNumber: bigint
  ) => Promise<bigint>;
}

export async function getAmountsOutOnChain(
  chainId: number,
  router: Hex,
  amountIn: bigint,
  path: readonly Hex[],
  blockNumber: bigint
): Promise<bigint> {
  const client = getClient(chainId);
  const amounts = await client.readContract({
    address: router,
    abi: V2_ROUTER_ABI,
    functionName: "getAmountsOut",
    args: [amountIn, path as Hex[]],
    blockNumber,
  });
  return amounts[amounts.length - 1];
}

const defaultReaders: QuantifySlippageReaders = { getAmountsOut: getAmountsOutOnChain };

/**
 * Turns "reverted on slippage" into a number: how much the price actually
 * moved vs. how much tolerance the user gave it. V2-only (see module doc) —
 * V3's concentrated-liquidity math (sqrtPriceX96, tick ranges) and packed
 * multi-hop path encoding are a meaningfully different decode; TODO once a
 * verified V3 quoter address/ABI is confirmed for the target chain rather
 * than assumed.
 */
export async function quantifySlippageV2(
  chainId: number,
  router: Hex,
  calldata: Hex,
  referenceBlockNumber: bigint,
  executionBlockNumber: bigint,
  readers: Partial<QuantifySlippageReaders> = {}
): Promise<QuantifiedSlippage | null> {
  const { getAmountsOut } = { ...defaultReaders, ...readers };

  let decoded;
  try {
    decoded = decodeFunctionData({ abi: V2_ROUTER_ABI, data: calldata });
  } catch {
    return null; // not a decodable standard V2 swap call
  }

  if (decoded.functionName !== "swapExactTokensForTokens" && decoded.functionName !== "swapExactTokensForETH") {
    return null; // TODO: swapExactETHForTokens needs tx.value (amountIn isn't a calldata param for it) — not wired yet
  }

  const [amountIn, amountOutMin, path] = decoded.args;

  const [expectedOutAtReference, actualOutAtExecution] = await Promise.all([
    getAmountsOut(chainId, router, amountIn, path, referenceBlockNumber),
    getAmountsOut(chainId, router, amountIn, path, executionBlockNumber),
  ]);

  if (expectedOutAtReference === BigInt(0)) return null; // can't compute a meaningful percentage against a zero quote

  const priceMovementPercent =
    Number(((expectedOutAtReference - actualOutAtExecution) * BigInt(10_000)) / expectedOutAtReference) / 100;
  const slippageTolerancePercent =
    Number(((expectedOutAtReference - amountOutMin) * BigInt(10_000)) / expectedOutAtReference) / 100;

  return {
    path: [...path],
    amountIn,
    amountOutMin,
    expectedOutAtReference,
    actualOutAtExecution,
    priceMovementPercent,
    slippageTolerancePercent,
  };
}
