import { describe, expect, it } from "vitest";
import { decodeFunctionData, parseAbi } from "viem";
import { buildApproveCalldata, buildRetrySwapCalldata, bumpFee } from "./calldata.js";
import type { QuantifiedSlippage } from "./types.js";

const SPENDER = "0x1111111111111111111111111111111111111111" as const;
const TOKEN_A = "0x2222222222222222222222222222222222222222" as const;
const TOKEN_B = "0x3333333333333333333333333333333333333333" as const;
const RECIPIENT = "0x4444444444444444444444444444444444444444" as const;

describe("buildApproveCalldata", () => {
  it("encodes an unlimited approval by default", () => {
    const calldata = buildApproveCalldata(SPENDER);
    const decoded = decodeFunctionData({
      abi: parseAbi(["function approve(address spender, uint256 amount)"]),
      data: calldata,
    });
    expect(decoded.args[0]).toBe(SPENDER);
    expect(decoded.args[1]).toBe(2n ** 256n - 1n);
  });
});

describe("buildRetrySwapCalldata", () => {
  it("computes a wider amountOutMin consistent with the observed price movement plus buffer", () => {
    const quantified: QuantifiedSlippage = {
      path: [TOKEN_A, TOKEN_B],
      amountIn: "1000",
      amountOutMin: "950",
      expectedOutAtReference: "1000",
      actualOutAtExecution: "900",
      priceMovementPercent: 10, // price moved 10% against the user
      slippageTolerancePercent: 5, // original tolerance was only 5%
    };

    const { calldata, newAmountOutMin, newTolerancePercent } = buildRetrySwapCalldata({
      quantified,
      recipient: RECIPIENT,
      bufferPercent: 1,
    });

    expect(newTolerancePercent).toBeCloseTo(11); // 10% observed movement + 1% buffer
    // newAmountOutMin = 1000 - 1000*11% = 890
    expect(newAmountOutMin).toBe(890n);

    const decoded = decodeFunctionData({
      abi: parseAbi([
        "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)",
      ]),
      data: calldata,
    });
    expect(decoded.args[0]).toBe(1000n);
    expect(decoded.args[1]).toBe(890n);
    expect(decoded.args[2]).toEqual([TOKEN_A, TOKEN_B]);
    expect(decoded.args[3]).toBe(RECIPIENT);
  });
});

describe("bumpFee", () => {
  it("bumps at least the requested percent above the original tx fee", () => {
    const result = bumpFee(1_000_000_000n, 900_000_000n, 20);
    expect(result).toBe(1_200_000_000n); // 20% above original
  });

  it("floors at 10% above current network price when that's higher than the percent bump", () => {
    const result = bumpFee(500_000_000n, 2_000_000_000n, 20);
    // 20% bump on tx fee = 600_000_000; network floor = 2.2B, which wins
    expect(result).toBe(2_200_000_000n);
  });
});
