import type { CSSProperties } from "react";
import { colors, font, radius, signalColor, type Signal } from "../theme.js";
import { confidenceBand, type Diagnosis } from "../types.js";
import { AlertIcon, CheckIcon, ClockIcon, ExternalLinkIcon } from "./Icons.js";

export type ActionKind = "switch_network" | "speed_up" | "approve" | "retry_swap" | "bridge_claim" | "none";

export interface ActionConfig {
  kind: ActionKind;
  label: string;
  /** True only when the widget actually has what it needs to perform this (e.g. a token/spender address) — never show a button it can't deliver on. */
  available: boolean;
  unavailableReason?: string;
}

export interface DiagnosisCardProps {
  diagnosis: Diagnosis;
  /** Native currency-style explorer link for the diagnosed tx, if the host knows one. */
  explorerUrl?: string;
  actionState: "idle" | "pending" | "error";
  actionError: string | null;
  onRunAction: () => void;
  onEscalate: () => void;
  actionContext?: ActionContext;
}

const styles: Record<string, CSSProperties> = {
  card: {
    fontFamily: font.ui,
    color: colors.text,
    background: colors.bgElevated,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "12px 16px",
    borderBottom: `1px solid ${colors.border}`,
  },
  headerLabel: { fontSize: 12, fontWeight: 600, letterSpacing: 0.3 },
  body: { padding: 16 },
  headline: { fontSize: 15, fontWeight: 500, lineHeight: 1.5, margin: 0 },
  hedge: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  fixBox: {
    marginTop: 14,
    padding: 12,
    background: colors.bgElevated2,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.md,
    fontSize: 13,
    lineHeight: 1.5,
    color: colors.text,
  },
  button: {
    marginTop: 12,
    cursor: "pointer",
    width: "100%",
    padding: "10px 14px",
    fontFamily: font.ui,
    fontSize: 13,
    fontWeight: 600,
    borderRadius: radius.md,
    border: `1px solid ${colors.borderStrong}`,
    background: colors.bgElevated2,
    color: colors.text,
  },
  link: {
    marginTop: 12,
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 13,
    color: colors.textMuted,
    textDecoration: "none",
  },
  footnote: {
    marginTop: 14,
    paddingTop: 10,
    borderTop: `1px solid ${colors.border}`,
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.textFaint,
  },
  actionError: { marginTop: 10, fontSize: 12, color: signalColor("problem").fg },
};

function modeSignal(mode: Diagnosis["mode"]): Signal {
  switch (mode) {
    case "NOT_A_FAILURE":
      return "resolved";
    case "BRIDGE_WITHIN_NORMAL_WINDOW":
      return "pending";
    case "UNKNOWN_PENDING":
      return "neutral";
    default:
      return "problem";
  }
}

function modeLabel(mode: Diagnosis["mode"]): string {
  return mode.replace(/_/g, " ");
}

/** Plain-language headline per mode — reads evidence where useful. Kept separate from the fix/action so hedge language can wrap just this line. */
function headlineFor(diagnosis: Diagnosis): string {
  const e = diagnosis.evidence;
  switch (diagnosis.mode) {
    case "NOT_A_FAILURE":
      return "This transaction succeeded — no failure detected.";
    case "WRONG_NETWORK": {
      const expected = e.expected ?? e.expectedChainId;
      const connected = e.connected ?? e.foundOnChainId;
      return `Your wallet was on chain ${connected}, but this needs chain ${expected}.`;
    }
    case "NONCE_GAP":
      return `A transaction at nonce ${e.pendingNonce ?? "an earlier position"} hasn't gone through yet — this one is queued behind it.`;
    case "NONCE_ALREADY_USED":
      return "This exact transaction was replaced by another one at the same nonce.";
    case "GAS_UNDERPRICED":
      return "Network fees rose after you submitted — this is stuck below the current minimum.";
    case "SLIPPAGE_REVERT": {
      const q = diagnosis.quantifiedSlippage;
      if (q) {
        return `Price moved ${q.priceMovementPercent.toFixed(2)}% between submission and execution; your tolerance was ${q.slippageTolerancePercent.toFixed(2)}%.`;
      }
      return "Reverted on slippage — the price moved past your tolerance.";
    }
    case "INSUFFICIENT_ALLOWANCE":
      return "This contract needs approval to spend your tokens before it can complete.";
    case "INSUFFICIENT_BALANCE":
      return "You don't have enough of the token this transaction needs — approving more won't help here.";
    case "BRIDGE_SOURCE_NOT_CONFIRMED":
      return "The source-chain transaction hasn't confirmed yet — nothing to bridge until it does.";
    case "BRIDGE_WITHIN_NORMAL_WINDOW":
      return "Still within the normal transfer window — this isn't stuck yet.";
    case "BRIDGE_STUCK":
      return diagnosis.bridgeDeepDive?.note ?? "This bridge transfer looks stuck.";
    default:
      return "Couldn't determine a specific cause from the available signals.";
  }
}

export interface ActionContext {
  /** Host-supplied, only when it already knows which token needed approval — the diagnosis evidence alone doesn't carry a token/spender address. */
  token?: string;
  spender?: string;
}

/**
 * Returns null when there's genuinely no safe automated fix — the card
 * shows an explorer link instead of inventing a button. Two cases worth
 * calling out explicitly:
 * - Bridge claims need a verified per-bridge contract address/ABI this
 *   project doesn't have (see agent-core's bridgeDeepDive.ts) — a fake
 *   "Claim" button that doesn't actually call anything real would be
 *   exactly the dishonesty section 6 warns against, so this stays a
 *   "Track status" link, not an action, even for NEEDS_MANUAL_CLAIM.
 * - Approve needs a token + spender address the diagnosis itself doesn't
 *   expose (only the allowance number). It's only offered when the host
 *   app supplies that context directly, since it already knows which
 *   contract its own failed transaction was approving for.
 */
export function actionFor(diagnosis: Diagnosis, context?: ActionContext): ActionConfig | null {
  switch (diagnosis.mode) {
    case "WRONG_NETWORK":
      return { kind: "switch_network", label: "Switch network", available: true };
    case "GAS_UNDERPRICED":
      return { kind: "speed_up", label: "Speed up", available: true };
    case "INSUFFICIENT_ALLOWANCE":
      return context?.token && context?.spender
        ? { kind: "approve", label: "Approve", available: true }
        : {
            kind: "approve",
            label: "Approve",
            available: false,
            unavailableReason: "Don't have the token/spender address needed to build the approval — check the dApp's own approve flow.",
          };
    case "SLIPPAGE_REVERT":
      return diagnosis.quantifiedSlippage
        ? {
            kind: "retry_swap",
            label: `Retry with ${(diagnosis.quantifiedSlippage.priceMovementPercent + 1).toFixed(1)}% tolerance`,
            available: true,
          }
        : { kind: "none", label: "", available: false, unavailableReason: "Couldn't quantify the price movement for this swap." };
    default:
      return null; // nonce modes, bridge modes, informational cases: genuinely no safe one-click fix
  }
}

export function DiagnosisCard({
  diagnosis,
  explorerUrl,
  actionState,
  actionError,
  onRunAction,
  onEscalate,
  actionContext,
}: DiagnosisCardProps) {
  const signal = modeSignal(diagnosis.mode);
  const tone = signalColor(signal);
  const band = confidenceBand(diagnosis.confidence);
  const action = actionFor(diagnosis, actionContext);
  const blockNumber = diagnosis.evidence.blockNumber;

  return (
    <div style={styles.card}>
      <div style={{ ...styles.header, color: tone.fg }}>
        {signal === "resolved" ? <CheckIcon /> : signal === "pending" ? <ClockIcon /> : <AlertIcon />}
        <span style={styles.headerLabel}>{modeLabel(diagnosis.mode)}</span>
      </div>

      <div style={styles.body}>
        <p style={styles.headline}>{headlineFor(diagnosis)}</p>

        {band !== "high" && (
          <p style={styles.hedge}>
            {band === "medium" ? "Likely cause — " : "Low-confidence guess — "}
            based on the signals available, not a certainty.
          </p>
        )}

        {action?.available && (
          <button
            type="button"
            style={{ ...styles.button, opacity: actionState === "pending" ? 0.6 : 1 }}
            disabled={actionState === "pending"}
            onClick={onRunAction}
          >
            {actionState === "pending" ? "Confirm in your wallet…" : action.label}
          </button>
        )}

        {action && !action.available && action.unavailableReason && (
          <p style={styles.hedge}>{action.unavailableReason}</p>
        )}

        {actionState === "error" && actionError && <p style={styles.actionError}>{actionError}</p>}

        {!action && explorerUrl && (
          <a href={explorerUrl} target="_blank" rel="noreferrer" style={styles.link}>
            View on explorer <ExternalLinkIcon />
          </a>
        )}

        {!action && (
          <button type="button" style={{ ...styles.button, marginTop: action || explorerUrl ? 8 : 12 }} onClick={onEscalate}>
            Talk to a human
          </button>
        )}

        {typeof blockNumber !== "undefined" && (
          <p style={styles.footnote}>read from block {String(blockNumber)} · rule: {diagnosis.ruleTriggered}</p>
        )}
      </div>
    </div>
  );
}
