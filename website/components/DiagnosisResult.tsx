import { IconAlert, IconCheck } from "./icons";
import type { Diagnosis, FailureMode } from "@support-agent-asp/agent-core";
import { SCAN_LOG, type DiagnosisStatus } from "@/lib/useDiagnosis";

const STATUS_STYLE: Record<FailureMode, { tone: string; label: string }> = {
  slippage: { tone: "danger", label: "SLIPPAGE REVERT" },
  allowance: { tone: "danger", label: "INSUFFICIENT ALLOWANCE" },
  wrong_network: { tone: "danger", label: "WRONG NETWORK" },
  bridge_stuck: { tone: "warning", label: "BRIDGE PENDING" },
  gas_too_low: { tone: "warning", label: "GAS TOO LOW" },
  nonce_gap: { tone: "warning", label: "NONCE GAP" },
  reverted_other: { tone: "danger", label: "REVERTED" },
  pending: { tone: "warning", label: "PENDING" },
  healthy: { tone: "success", label: "SUCCESS" },
  not_found: { tone: "warning", label: "NOT FOUND" },
};

function ResultIcon({ mode }: { mode: FailureMode }) {
  if (mode === "healthy") return <IconCheck className="h-5 w-5" />;
  return <IconAlert className="h-5 w-5" />;
}

interface DiagnosisResultProps {
  status: DiagnosisStatus;
  result: Diagnosis | null;
  error: string | null;
  logIndex: number;
}

/**
 * Renders the loading scan / error / result card for a diagnosis run.
 * Shared between the Hero form (inline, no navigation) and the dedicated
 * #diagnose section, so both look and behave identically.
 */
export function DiagnosisResult({ status, result, error, logIndex }: DiagnosisResultProps) {
  const toneClass =
    result &&
    {
      danger: "text-danger border-danger",
      warning: "text-warning border-warning",
      success: "text-success border-success",
    }[STATUS_STYLE[result.mode].tone];

  if (status === "loading") {
    return (
      <div className="relative mt-8 overflow-hidden rounded-2xl border border-border bg-bg-elevated/70 p-6 backdrop-blur-md">
        <div className="animate-scan pointer-events-none absolute inset-x-0 h-16 bg-primary/5" />
        <div className="space-y-2 font-mono text-xs text-text-muted">
          {SCAN_LOG.slice(0, logIndex + 1).map((line, i) => (
            <div key={line} className="flex items-center gap-2">
              <span className={i === logIndex ? "text-primary animate-blink" : "text-primary"}>&gt;</span>
              {line}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mt-8 rounded-2xl border border-danger bg-bg-elevated/70 p-6 backdrop-blur-md">
        <div className="flex items-center gap-2 text-danger">
          <IconAlert className="h-4 w-4" />
          <span className="font-heading text-base font-bold">Couldn&apos;t diagnose</span>
        </div>
        <p className="mt-2 font-body text-sm text-text-muted">{error}</p>
      </div>
    );
  }

  if (status === "done" && result) {
    return (
      <div className={`mt-8 rounded-2xl border ${toneClass ?? "border-border"} bg-bg-elevated/70 backdrop-blur-md shadow-[0_0_40px_-16px_rgba(198,226,79,0.25)]`}>
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className={`flex items-center gap-2 ${toneClass ?? ""}`}>
            <ResultIcon mode={result.mode} />
            <span className="font-heading text-base font-bold tracking-wide">
              {STATUS_STYLE[result.mode].label}
            </span>
          </div>
          {result.chainLabel && (
            <span className="font-mono text-xs text-text-faint">{result.chainLabel}</span>
          )}
        </div>

        <div className="px-6 py-6">
          <p className="font-mono text-xs text-text-faint truncate">{result.hash}</p>
          <p className="mt-3 font-heading text-xl font-bold leading-snug text-text">{result.headline}</p>

          <div className="mt-5 rounded-lg border border-border bg-primary-soft/40 p-4">
            <span className="font-mono text-[11px] text-primary">FIX</span>
            <p className="mt-1 font-body text-sm leading-relaxed text-text">{result.fix}</p>
          </div>

          {Object.keys(result.details).length > 0 && (
            <dl className="mt-5 space-y-1.5 border-t border-border pt-4">
              {Object.entries(result.details).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 font-mono text-xs">
                  <dt className="text-text-faint">{k}</dt>
                  <dd className="truncate text-text-muted">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    );
  }

  return null;
}
