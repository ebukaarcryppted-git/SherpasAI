import { describe, expect, it } from "vitest";
import { encodeFunctionData, parseAbi, type Hex } from "viem";
import { quantifySlippageV2 } from "./quantifySlippage.js";

const ROUTER_ABI = parseAbi([
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)",
]);

const ROUTER = "0x1111111111111111111111111111111111111111" as Hex;
const TOKEN_A = "0x2222222222222222222222222222222222222222" as Hex;
const TOKEN_B = "0x3333333333333333333333333333333333333333" as Hex;

function buildSwapCalldata(amountIn: bigint, amountOutMin: bigint): Hex {
  return encodeFunctionData({
    abi: ROUTER_ABI,
    functionName: "swapExactTokensForTokens",
    args: [amountIn, amountOutMin, [TOKEN_A, TOKEN_B], "0x4444444444444444444444444444444444444444", BigInt(9_999_999_999)],
  });
}

describe("quantifySlippageV2", () => {
  it("computes price movement and tolerance from real calldata", async () => {
    const amountIn = BigInt(1000);
    const amountOutMin = BigInt(950); // user accepted up to ~5% slippage
    const calldata = buildSwapCalldata(amountIn, amountOutMin);

    const result = await quantifySlippageV2(196, ROUTER, calldata, BigInt(100), BigInt(101), {
      getAmountsOut: async (_chainId, _router, _amountIn, _path, blockNumber) =>
        blockNumber === BigInt(100) ? BigInt(1000) : BigInt(900), // price moved from 1000 -> 900 (10% move)
    });

    expect(result).not.toBeNull();
    expect(result!.expectedOutAtReference).toBe(BigInt(1000));
    expect(result!.actualOutAtExecution).toBe(BigInt(900));
    expect(result!.priceMovementPercent).toBeCloseTo(10, 5); // (1000-900)/1000 = 10%
    expect(result!.slippageTolerancePercent).toBeCloseTo(5, 5); // (1000-950)/1000 = 5%
    // The revert is explained: price moved 10%, tolerance was only 5%.
    expect(result!.priceMovementPercent).toBeGreaterThan(result!.slippageTolerancePercent);
  });

  it("reports a negative price movement when the price actually moved in the user's favor", async () => {
    const calldata = buildSwapCalldata(BigInt(1000), BigInt(950));

    const result = await quantifySlippageV2(196, ROUTER, calldata, BigInt(100), BigInt(101), {
      getAmountsOut: async (_chainId, _router, _amountIn, _path, blockNumber) =>
        blockNumber === BigInt(100) ? BigInt(1000) : BigInt(1050), // price improved
    });

    expect(result!.priceMovementPercent).toBeLessThan(0);
  });

  it("returns null for calldata it can't decode as a standard V2 swap", async () => {
    const result = await quantifySlippageV2(
      196,
      ROUTER,
      "0xdeadbeef00000000000000000000000000000000000000000000000000000000dead" as Hex,
      BigInt(100),
      BigInt(101)
    );
    expect(result).toBeNull();
  });

  it("returns null rather than dividing by zero when the reference-block quote is zero", async () => {
    const calldata = buildSwapCalldata(BigInt(1000), BigInt(0));

    const result = await quantifySlippageV2(196, ROUTER, calldata, BigInt(100), BigInt(101), {
      getAmountsOut: async () => BigInt(0),
    });

    expect(result).toBeNull();
  });
});
