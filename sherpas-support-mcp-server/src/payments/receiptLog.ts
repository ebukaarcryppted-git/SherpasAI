import { appendFile, readFile } from "node:fs/promises";
import { baseUnitsToUsd } from "./pricing.js";

export interface ReceiptEntry {
  timestamp: string;
  channelId: string;
  payer: string;
  units: number;
  spentBaseUnits: string;
  action: "voucher" | "open" | "topUp" | "close";
}

/**
 * Append-only accounting log — spec's "receipts and the accounting story":
 * enough to answer "what has this protocol spent on automated support, and
 * what's the resolution rate per dollar" without standing up real
 * infrastructure. Swap for a real table before production traffic, same
 * caveat as the in-memory channel store.
 */
const LOG_PATH = process.env.RECEIPT_LOG_PATH ?? "./payment-receipts.jsonl";

export async function recordReceipt(entry: ReceiptEntry): Promise<void> {
  await appendFile(LOG_PATH, JSON.stringify(entry) + "\n").catch((err) => {
    console.error("Failed to record payment receipt (non-fatal):", err);
  });
}

export interface ReceiptsSummary {
  totalCalls: number;
  totalSpentUsd: number;
  byChannel: Record<string, { calls: number; spentUsd: number }>;
}

/** Reads back the ledger for the "here's what you've spent" dashboard moment. */
export async function summarizeReceipts(): Promise<ReceiptsSummary> {
  const text = await readFile(LOG_PATH, "utf8").catch(() => "");
  const lines = text.split("\n").filter(Boolean);
  const summary: ReceiptsSummary = { totalCalls: 0, totalSpentUsd: 0, byChannel: {} };

  for (const line of lines) {
    let entry: ReceiptEntry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.action !== "voucher") continue;
    summary.totalCalls += 1;
    const channel = (summary.byChannel[entry.channelId] ??= { calls: 0, spentUsd: 0 });
    channel.calls += 1;
    // Vouchers are cumulative by design, so the latest entry per channel IS
    // the running total for that channel — summing every row would double-count.
    channel.spentUsd = baseUnitsToUsd(entry.spentBaseUnits);
  }

  summary.totalSpentUsd = Object.values(summary.byChannel).reduce((sum, c) => sum + c.spentUsd, 0);
  return summary;
}
