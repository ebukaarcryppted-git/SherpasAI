import { describe, expect, it } from "vitest";
import { deepenBridgeStuck } from "./bridgeDeepDive.js";
import type { TransactionLookup } from "@support-agent-asp/onchain-reader";

const X_LAYER = 196;
const ETH = 1;

describe("deepenBridgeStuck", () => {
  it("classifies NEEDS_MANUAL_CLAIM for an X Layer withdrawal past the documented 7-day challenge period", async () => {
    const result = await deepenBridgeStuck({
      sourceChainId: X_LAYER,
      destinationChainId: ETH,
      minutesSinceSourceConfirmed: 8 * 24 * 60, // 8 days
    });

    expect(result.subMode).toBe("NEEDS_MANUAL_CLAIM");
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it("does NOT claim NEEDS_MANUAL_CLAIM while still within the challenge period", async () => {
    const result = await deepenBridgeStuck({
      sourceChainId: X_LAYER,
      destinationChainId: ETH,
      minutesSinceSourceConfirmed: 60, // 1 hour
    });

    expect(result.subMode).not.toBe("NEEDS_MANUAL_CLAIM");
    expect(result.subMode).toBe("UNKNOWN");
  });

  it("classifies SILENTLY_FAILED_ON_DESTINATION when a known destination tx actually reverted", async () => {
    const result = await deepenBridgeStuck({
      sourceChainId: ETH,
      destinationChainId: X_LAYER,
      minutesSinceSourceConfirmed: 30,
      destinationTxHash: "0xdeadbeef" as `0x${string}`,
      readers: {
        lookupTransactionOnChain: async () =>
          ({ found: true, chainId: X_LAYER, hash: "0xdeadbeef", status: "reverted", revertReason: "out of gas" }) as TransactionLookup,
      },
    });

    expect(result.subMode).toBe("SILENTLY_FAILED_ON_DESTINATION");
    expect(result.evidence.revertReason).toBe("out of gas");
  });

  it("does not falsely report a silent failure when the destination tx isn't found yet", async () => {
    const result = await deepenBridgeStuck({
      sourceChainId: ETH,
      destinationChainId: X_LAYER,
      minutesSinceSourceConfirmed: 30,
      destinationTxHash: "0xdeadbeef" as `0x${string}`,
      readers: {
        lookupTransactionOnChain: async () =>
          ({ found: false, chainId: X_LAYER, hash: "0xdeadbeef", status: "not_found" }) as TransactionLookup,
      },
    });

    expect(result.subMode).not.toBe("SILENTLY_FAILED_ON_DESTINATION");
  });

  it("falls back to an honest UNKNOWN for routes/sub-modes it can't verify (no fabricated relayer-delay claim)", async () => {
    const result = await deepenBridgeStuck({
      sourceChainId: 999_999, // some other bridge route entirely
      destinationChainId: X_LAYER,
      minutesSinceSourceConfirmed: 120,
    });

    expect(result.subMode).toBe("UNKNOWN");
    expect(result.confidence).toBeLessThan(0.5);
  });
});
