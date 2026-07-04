/**
 * Design direction: this is diagnostic tooling for a technical audience
 * transacting real value, not a customer-service chatbot — it should read
 * closer to a wallet's transaction detail view (MetaMask activity tab,
 * Etherscan dark mode) than to a rounded-bubble AI widget. Near-monochrome
 * base; color is spent ONLY on the diagnosis signal itself (problem found
 * vs. resolved), never on chrome. No external font load — this embeds on
 * arbitrary host pages, so native OS font stacks only.
 */

export const colors = {
  bg: "#0a0a0b",
  bgElevated: "#141416",
  bgElevated2: "#1c1c1f",
  border: "#26262b",
  borderStrong: "#38383f",
  text: "#f2f2f4",
  textMuted: "#9a9aa2",
  textFaint: "#5c5c64",

  // The only two colors in this system that mean something — reserved for
  // the diagnosis result itself, never used for buttons/borders/chrome.
  signalProblem: "#e0574a",
  signalProblemSoft: "#2a1613",
  signalResolved: "#3ecf8e",
  signalResolvedSoft: "#0f2620",
  signalPending: "#d6a441",
  signalPendingSoft: "#2a2013",
} as const;

export const font = {
  ui: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  mono: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
} as const;

export const radius = {
  sm: 4,
  md: 6,
  lg: 8,
} as const;

export type Signal = "problem" | "resolved" | "pending" | "neutral";

export function signalColor(signal: Signal): { fg: string; bg: string } {
  switch (signal) {
    case "problem":
      return { fg: colors.signalProblem, bg: colors.signalProblemSoft };
    case "resolved":
      return { fg: colors.signalResolved, bg: colors.signalResolvedSoft };
    case "pending":
      return { fg: colors.signalPending, bg: colors.signalPendingSoft };
    default:
      return { fg: colors.textMuted, bg: colors.bgElevated };
  }
}
