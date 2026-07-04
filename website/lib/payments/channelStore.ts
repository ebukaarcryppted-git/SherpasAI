import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { generatePrivateKey } from "viem/accounts";
import type { Hex } from "viem";

/**
 * Persisted state for the ONE channel this proxy's funded wallet keeps open
 * against the gated diagnose_transaction endpoint. A real deployment should
 * swap this for a real datastore (Redis/Postgres) — same caveat OKX's own
 * seller SDK docs give for the channel-state store; this file-backed version
 * exists so a restart doesn't silently forget an open channel and try to
 * open a second one.
 */
export interface ChannelState {
  channelId: Hex;
  salt: Hex;
  /** Running total already spent on signed vouchers, in base units. */
  cumulativeAmount: string;
  /** True once `open` has been accepted by the gated server. */
  opened: boolean;
}

// Explicitly scoped to cwd + a turbopackIgnore comment so Next.js's file
// tracer doesn't treat this dynamic path as a reason to trace the whole
// project into the diagnose-proxy route's build output.
const STORE_PATH =
  process.env.MPP_CHANNEL_STORE_PATH ?? path.join(/* turbopackIgnore: true */ process.cwd(), ".mpp-channel-state.json");

export async function loadChannelState(): Promise<ChannelState | null> {
  try {
    const text = await readFile(STORE_PATH, "utf8");
    return JSON.parse(text) as ChannelState;
  } catch {
    return null;
  }
}

export async function saveChannelState(state: ChannelState): Promise<void> {
  await writeFile(STORE_PATH, JSON.stringify(state, null, 2));
}

/** Creates fresh, not-yet-opened channel state with a random salt. */
export function newChannelState(channelId: Hex, salt: Hex): ChannelState {
  return { channelId, salt, cumulativeAmount: "0", opened: false };
}

export function randomSalt(): Hex {
  return generatePrivateKey(); // any random 32 bytes works as a salt, not used as a real key
}
