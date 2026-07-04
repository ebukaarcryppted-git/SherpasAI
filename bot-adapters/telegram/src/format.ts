import type { Diagnosis } from "@support-agent-asp/agent-core";
import type { ApprovalReport } from "@support-agent-asp/agent-core";

/** Telegram uses MarkdownV2-ish HTML parse mode here for simplicity/robustness. */
export function diagnosisToMessage(diagnosis: Diagnosis): string {
  const lines = [
    `<b>${escapeHtml(diagnosis.headline)}</b>`,
    "",
    `<code>${escapeHtml(diagnosis.hash)}</code>`,
    "",
    `<b>Fix:</b> ${escapeHtml(diagnosis.fix)}`,
  ];

  const details = Object.entries(diagnosis.details);
  if (details.length > 0) {
    lines.push("", "<b>Details:</b>");
    for (const [k, v] of details) {
      lines.push(`• ${escapeHtml(k)}: <code>${escapeHtml(v)}</code>`);
    }
  }

  if (diagnosis.chainLabel) {
    lines.push("", `<i>${escapeHtml(diagnosis.chainLabel)}</i>`);
  }

  return lines.join("\n");
}

export function approvalsToMessage(report: ApprovalReport): string {
  const lines = [`<b>${escapeHtml(report.summary)}</b>`, ""];

  for (const f of report.findings) {
    lines.push(
      `• <b>${escapeHtml(f.tokenSymbol)}</b> → <code>${escapeHtml(f.spender)}</code> — ${
        f.unlimited ? "⚠️ UNLIMITED" : "limited"
      }`
    );
  }
  if (report.findings.length === 0) lines.push("No active approvals found.");

  if (report.recommendations.length > 0) {
    lines.push("", "<b>Recommendations:</b>");
    for (const r of report.recommendations) lines.push(`• ${escapeHtml(r)}`);
  }

  return lines.join("\n");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
