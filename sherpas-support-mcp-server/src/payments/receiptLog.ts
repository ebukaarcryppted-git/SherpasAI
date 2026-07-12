import { appendFile, readFile } from "node:fs/promises";
import { baseUnitsToUsd } from "./pricing.js";

export interface ReceiptEntry {
  timestamp: string;
  payer: string;
  spentBaseUnits: string;
  transaction: string;
}

/**
 * Append-only accounting log — enough to answer "what has this protocol
 * spent on automated support" without standing up real infrastructure.
 * Swap for a real table before production traffic at volume.
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
}

/** Reads back the ledger for the "here's what you've spent" dashboard moment. */
export async function summarizeReceipts(): Promise<ReceiptsSummary> {
  const text = await readFile(LOG_PATH, "utf8").catch(() => "");
  const lines = text.split("\n").filter(Boolean);
  const summary: ReceiptsSummary = { totalCalls: 0, totalSpentUsd: 0 };

  for (const line of lines) {
    let entry: ReceiptEntry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    summary.totalCalls += 1;
    summary.totalSpentUsd += baseUnitsToUsd(entry.spentBaseUnits);
  }

  return summary;
}
