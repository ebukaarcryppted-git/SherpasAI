import type { Hash, Hex } from "viem";
import { checkBridgeStatus, type BridgeContext } from "@support-agent-asp/onchain-reader";
import type { Diagnosis } from "./types.js";

const HEADLINES: Record<BridgeContext["status"], string> = {
  source_pending: "Your source-chain transaction hasn't confirmed yet.",
  in_transit: "Funds are still in transit — this is normal.",
  needs_claim: "Your transfer may be waiting on a manual claim step.",
  likely_completed: "This transfer has likely completed.",
  stuck: "This transfer looks stuck.",
  unknown: "Couldn't determine bridge status from chain data alone.",
};

const FIXES: Record<BridgeContext["status"], string> = {
  source_pending: "Wait for the source-chain transaction to confirm, then check again.",
  in_transit: "No action needed yet — check back in a few minutes if it's not on the grace-period edge.",
  needs_claim: "Check the bridge UI for a pending claim button — some paths require you to manually claim on the destination chain rather than receiving an automatic mint.",
  likely_completed: "Check your destination-chain wallet balance to confirm the funds arrived.",
  stuck: "Check the bridge UI for a pending/failed claim first. If there's genuinely nothing there after a reasonable wait, contact the bridge operator's support with this tx hash.",
  unknown: "Check both chains directly on a block explorer, or contact the bridge operator's support with this tx hash.",
};

/** Wraps checkBridgeStatus into the same Diagnosis shape as tx diagnosis, for a consistent bot/UI response. */
export async function diagnoseBridge(
  sourceChainId: number,
  destinationChainId: number,
  sourceTxHash: Hash,
  recipient: Hex
): Promise<Diagnosis> {
  const bridge = await checkBridgeStatus(sourceChainId, destinationChainId, sourceTxHash, recipient);

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
