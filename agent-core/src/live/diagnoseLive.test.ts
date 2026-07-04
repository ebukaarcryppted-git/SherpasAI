import { describe, expect, it } from "vitest";
import { encodeFunctionData, parseAbi, type Hex } from "viem";
import { diagnoseLive } from "./diagnoseLive.js";
import type { LiveReaders } from "./readers.js";
import type {
  CrossChainTxLookup,
  NonceContext,
  GasContext,
  AllowanceContext,
  TransactionLookup,
} from "@support-agent-asp/onchain-reader";

const ROUTER_ABI = parseAbi([
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)",
]);

/** Standard Error(string) ABI encoding, same approach as classify.fixtures.ts. */
function encodeErrorString(reason: string): Hex {
  const utf8 = Buffer.from(reason, "utf8");
  const lengthHex = utf8.length.toString(16).padStart(64, "0");
  const dataHex = utf8.toString("hex").padEnd(Math.ceil((utf8.length * 2) / 64) * 64, "0");
  const offsetHex = (32).toString(16).padStart(64, "0");
  return `0x08c379a0${offsetHex}${lengthHex}${dataHex}` as Hex;
}

const X_LAYER = 196;

function mockReaders(overrides: Partial<LiveReaders> = {}): LiveReaders {
  return {
    findTransactionAcrossChains: async () => ({ hash: "0x000000000000000000000000000000000000000000000000000000000000cafe", foundOn: [], wrongNetworkSuspected: false }) as CrossChainTxLookup,
    lookupTransactionOnChain: async () =>
      ({ found: false, chainId: X_LAYER, hash: "0x000000000000000000000000000000000000000000000000000000000000cafe", status: "not_found" }) as TransactionLookup,
    getNonceContext: async () =>
      ({ chainId: X_LAYER, address: "0xaddr", latestNonce: 5, pendingNonce: 5, hasGap: false, hasPendingBacklog: false }) as NonceContext,
    getGasContext: async () =>
      ({ chainId: X_LAYER, currentBaseFeePerGas: BigInt(1_000_000_000), currentGasPrice: BigInt(1_000_000_000), underpriced: false }) as GasContext,
    getAllowance: async () =>
      ({ chainId: X_LAYER, token: "0xtoken", owner: "0xowner", spender: "0xspender", allowance: BigInt(0), decimals: 18, symbol: "TKN" }) as AllowanceContext,
    getBaseFeeAtTimestamp: async () => BigInt(1_000_000_000),
    getCode: async () => "0x",
    getAmountsOut: async () => BigInt(0),
    ...overrides,
  };
}

describe("diagnoseLive", () => {
  it("rejects a malformed hash immediately, with zero RPC calls — regression for a live-confirmed 90s+ hang", async () => {
    // A truncated/mistyped hash (62 hex chars instead of 64) sent straight
    // to the RPC produced a JSON-RPC error that took 90+ seconds to fail
    // through combined viem/fallback retry layers. Real users will paste
    // truncated hashes; this must fail fast, before any network call.
    let calledRpc = false;
    const readers = mockReaders({
      findTransactionAcrossChains: async () => {
        calledRpc = true;
        return { hash: "0x", foundOn: [], wrongNetworkSuspected: false } as CrossChainTxLookup;
      },
    });

    const result = await diagnoseLive({
      txHash: "0x0000000000000000000000000000000000000000000000000000000000dead" as `0x${string}`, // 62 hex chars
      readers,
    });

    expect(calledRpc).toBe(false);
    expect(result.ruleTriggered).toBe("diagnoseLive:invalidHashFormat");
    expect(result.confidence).toBe(0);
  });

  it("short-circuits a plain successful (non-bridge) tx with NOT_A_FAILURE rather than falling through classify.ts's generic catch-all", async () => {
    const readers = mockReaders({
      findTransactionAcrossChains: async () => ({
        hash: "0x000000000000000000000000000000000000000000000000000000000000cafe",
        foundOn: [
          {
            found: true,
            chainId: X_LAYER,
            hash: "0x000000000000000000000000000000000000000000000000000000000000cafe" as `0x${string}`,
            status: "success",
            from: "0xfrom" as `0x${string}`,
            to: "0xto" as `0x${string}`,
            blockNumber: BigInt(100),
            gasUsed: BigInt(21000),
          },
        ],
        wrongNetworkSuspected: false,
      }),
    });

    const result = await diagnoseLive({ txHash: "0x000000000000000000000000000000000000000000000000000000000000cafe" as `0x${string}`, readers });

    expect(result.mode).toBe("NOT_A_FAILURE");
    expect(result.healthy).toBe(true);
    expect(result.ruleTriggered).toBe("diagnoseLive:successNoRuleMatched");
  });

  it("does NOT short-circuit a successful source tx when bridge diagnosis was requested", async () => {
    const readers = mockReaders({
      findTransactionAcrossChains: async () => ({
        hash: "0x000000000000000000000000000000000000000000000000000000000000cafe",
        foundOn: [
          {
            found: true,
            chainId: X_LAYER,
            hash: "0x000000000000000000000000000000000000000000000000000000000000cafe" as `0x${string}`,
            status: "success",
            from: "0xfrom" as `0x${string}`,
            to: "0xto" as `0x${string}`,
            blockNumber: BigInt(100),
          },
        ],
        wrongNetworkSuspected: false,
      }),
    });

    const result = await diagnoseLive({
      txHash: "0x000000000000000000000000000000000000000000000000000000000000cafe" as `0x${string}`,
      readers,
      bridge: {
        sourceChainId: 1,
        destinationChainId: X_LAYER,
        expectedTimeSeconds: 900,
        protocol: "test-bridge",
      },
    });

    // Should have gone through classify.diagnose() with the bridge object attached,
    // not the plain success short-circuit.
    expect(result.ruleTriggered).not.toBe("diagnoseLive:successNoRuleMatched");
  });

  it("regression: a tx that succeeded on a DIFFERENT chain than expected must report WRONG_NETWORK, not NOT_A_FAILURE", async () => {
    // Reproduces a real bug found via live testing: a real Ethereum tx
    // queried with expectedChainId=X Layer was misreported as healthy,
    // because buildDiagnosisInput passed through the tx's real ("success")
    // status instead of "not_found", so classify.ts's wrong-network
    // fallback (which only triggers on not_found) never even ran.
    const ETH = 1;
    const readers = mockReaders({
      findTransactionAcrossChains: async () => ({
        hash: "0x000000000000000000000000000000000000000000000000000000000000cafe",
        foundOn: [
          {
            found: true,
            chainId: ETH, // found on Ethereum, NOT the expected X Layer
            hash: "0x000000000000000000000000000000000000000000000000000000000000cafe" as `0x${string}`,
            status: "success",
            from: "0xfrom" as `0x${string}`,
            to: "0xto" as `0x${string}`,
            blockNumber: BigInt(100),
            gasUsed: BigInt(21000),
          },
        ],
        wrongNetworkSuspected: true,
      }),
    });

    const result = await diagnoseLive({
      txHash: "0x000000000000000000000000000000000000000000000000000000000000cafe" as `0x${string}`,
      expectedChainId: X_LAYER,
      readers,
    });

    expect(result.mode).toBe("WRONG_NETWORK");
    expect(result.healthy).toBeUndefined();
  });

  it("attaches a supplementary wrong-network signal note when revert data is empty and the target has no code", async () => {
    const readers = mockReaders({
      findTransactionAcrossChains: async () => ({
        hash: "0x000000000000000000000000000000000000000000000000000000000000cafe",
        foundOn: [
          {
            found: true,
            chainId: X_LAYER,
            hash: "0x000000000000000000000000000000000000000000000000000000000000cafe" as `0x${string}`,
            status: "reverted",
            from: "0xfrom" as `0x${string}`,
            to: "0xto" as `0x${string}`,
            rawRevertData: "0x",
            nonce: 5,
          },
        ],
        wrongNetworkSuspected: false,
      }),
      getCode: async () => "0x", // no code at all on this chain
    });

    const result = await diagnoseLive({ txHash: "0x000000000000000000000000000000000000000000000000000000000000cafe" as `0x${string}`, readers });

    expect(result.evidence.possibleWrongNetworkSignal).toBeDefined();
  });

  it("does NOT attach the supplementary signal when the target contract has real code", async () => {
    const readers = mockReaders({
      findTransactionAcrossChains: async () => ({
        hash: "0x000000000000000000000000000000000000000000000000000000000000cafe",
        foundOn: [
          {
            found: true,
            chainId: X_LAYER,
            hash: "0x000000000000000000000000000000000000000000000000000000000000cafe" as `0x${string}`,
            status: "reverted",
            from: "0xfrom" as `0x${string}`,
            to: "0xto" as `0x${string}`,
            rawRevertData: "0x",
            nonce: 5,
          },
        ],
        wrongNetworkSuspected: false,
      }),
      getCode: async () => "0x6080604052", // real bytecode present
    });

    const result = await diagnoseLive({ txHash: "0x000000000000000000000000000000000000000000000000000000000000cafe" as `0x${string}`, readers });

    expect(result.evidence.possibleWrongNetworkSignal).toBeUndefined();
  });

  it("enriches a SLIPPAGE_REVERT diagnosis with quantified price movement, using injected readers (no live RPC)", async () => {
    const calldata = encodeFunctionData({
      abi: ROUTER_ABI,
      functionName: "swapExactTokensForTokens",
      args: [
        BigInt(1000),
        BigInt(950),
        ["0x2222222222222222222222222222222222222222", "0x3333333333333333333333333333333333333333"],
        "0x4444444444444444444444444444444444444444",
        BigInt(9_999_999_999),
      ],
    });

    const readers = mockReaders({
      findTransactionAcrossChains: async () => ({
        hash: "0x000000000000000000000000000000000000000000000000000000000000cafe",
        foundOn: [
          {
            found: true,
            chainId: X_LAYER,
            hash: "0x000000000000000000000000000000000000000000000000000000000000cafe" as `0x${string}`,
            status: "reverted",
            from: "0xfrom" as `0x${string}`,
            to: "0xrouter" as `0x${string}`,
            input: calldata,
            rawRevertData: encodeErrorString("Too little received"),
            blockNumber: BigInt(500),
            nonce: 5,
          },
        ],
        wrongNetworkSuspected: false,
      }),
      getAmountsOut: async (_chainId, _router, _amountIn, _path, blockNumber) =>
        blockNumber === BigInt(499) ? BigInt(1000) : BigInt(900),
    });

    const result = await diagnoseLive({ txHash: "0x000000000000000000000000000000000000000000000000000000000000cafe" as `0x${string}`, readers });

    expect(result.mode).toBe("SLIPPAGE_REVERT");
    expect(result.quantifiedSlippage).toBeDefined();
    expect(result.quantifiedSlippage!.priceMovementPercent).toBeCloseTo(10, 5);
    expect(result.quantifiedSlippage!.slippageTolerancePercent).toBeCloseTo(5, 5);
  });
});
