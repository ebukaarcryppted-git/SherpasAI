import type { Hash } from "viem";
import { checkBridgeStatus, type BridgeContext } from "@support-agent-asp/onchain-reader";
import type { Diagnosis } from "./types.js";

const HEADLINES: Record<BridgeContext["status"], string> = {
  source_pending: "Your source-chain transaction hasn't confirmed yet.",
  in_transit: "Funds are still in transit — this is normal.",
  past_normal_window: "This transfer is past the typical transfer window.",
  unknown: "Couldn't determine bridge status from chain data alone.",
};

const FIXES: Record<BridgeContext["status"], string> = {
  source_pending: "Wait for the source-chain transaction to confirm, then check again.",
  in_transit: "No action needed yet — check back in a few minutes if it's not on the grace-period edge.",
  past_normal_window: "Check the bridge UI for a pending claim button — some paths require a manual claim on the destination chain rather than an automatic mint. If there's genuinely nothing there after a further wait, contact the bridge operator's support with this tx hash.",
  unknown: "Check both chains directly on a block explorer, or contact the bridge operator's support with this tx hash.",
};

/** Wraps checkBridgeStatus into the same Diagnosis shape as tx diagnosis, for a consistent bot/UI response. */
export async function diagnoseBridge(
  sourceChainId: number,
  destinationChainId: number,
  sourceTxHash: Hash
): Promise<Diagnosis> {
  const bridge = await checkBridgeStatus(sourceChainId, destinationChainId, sourceTxHash);

  return {
    hash: sourceTxHash,
    mode: "bridge_stuck",
    chainLabel: `${bridge.sourceChainId} → ${bridge.destinationChainId}`,
    headline: HEADLINES[bridge.status],
    fix: FIXES[bridge.status],
    details: {
      Status: bridge.status,
      ...(bridge.minutesSinceSourceConfirmed !== null
        ? { "Minutes since source confirmed": String(bridge.minutesSinceSourceConfirmed) }
        : {}),
      Note: bridge.note,
    },
  };
}
