"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { IconAlert, IconArrowRight, IconCheck, IconSearch } from "./icons";
import type { Diagnosis, FailureMode } from "@support-agent-asp/agent-core";

const SCAN_LOG = [
  "resolving transaction on X Layer mainnet…",
  "reading receipt + trace…",
  "checking allowance / gas / nonce state…",
  "classifying against known failure patterns…",
];

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

export function DiagnosisWidget() {
  const searchParams = useSearchParams();
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [logIndex, setLogIndex] = useState(0);
  const [result, setResult] = useState<Diagnosis | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runDiagnosis(hash: string) {
    setStatus("loading");
    setError(null);
    setResult(null);
    setLogIndex(0);

    try {
      const res = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hash }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Diagnosis failed.");
      setResult(data as Diagnosis);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("error");
    }
  }

  useEffect(() => {
    if (status !== "loading") return;
    const interval = setInterval(() => {
      setLogIndex((i) => Math.min(i + 1, SCAN_LOG.length - 1));
    }, 380);
    return () => clearInterval(interval);
  }, [status]);

  useEffect(() => {
    const tx = searchParams.get("tx");
    if (tx) {
      // Syncing widget state from the ?tx= URL param set by the Hero form.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValue(tx);
      runDiagnosis(tx);
    }
  }, [searchParams]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!value.trim() || status === "loading") return;
    runDiagnosis(value.trim());
  }

  const toneClass =
    result &&
    {
      danger: "text-danger border-danger",
      warning: "text-warning border-warning",
      success: "text-success border-success",
    }[STATUS_STYLE[result.mode].tone];

  return (
    <section id="diagnose" className="px-4 py-24">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <span className="font-mono text-xs text-primary">{"// TRY IT LIVE"}</span>
          <h2 className="mt-4 font-heading text-3xl font-bold tracking-tight text-text sm:text-4xl">
            Run a real diagnosis
          </h2>
          <p className="mt-3 font-body text-text-muted">
            This calls live X Layer RPCs. Paste any real tx hash from{" "}
            <span className="font-mono text-text">chain 196</span>.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-10 flex flex-col gap-3 sm:flex-row">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-bg-elevated px-4 py-3.5 focus-within:border-primary transition-colors duration-200">
            <IconSearch className="h-4 w-4 shrink-0 text-text-faint" />
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0x…"
              aria-label="Transaction hash"
              className="w-full bg-transparent font-mono text-sm text-text placeholder:text-text-faint focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={status === "loading"}
            className="cursor-pointer flex items-center justify-center gap-2 rounded-lg border border-primary bg-primary px-6 py-3.5 font-heading text-sm font-bold text-bg transition-colors duration-200 hover:bg-primary-hover hover:border-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "loading" ? "Reading chain…" : "Diagnose"}
            {status !== "loading" && <IconArrowRight className="h-4 w-4" />}
          </button>
        </form>

        {status === "loading" && (
          <div className="relative mt-8 overflow-hidden rounded-xl border border-border bg-bg-elevated p-6">
            <div className="animate-scan pointer-events-none absolute inset-x-0 h-16 bg-primary/5" />
            <div className="space-y-2 font-mono text-xs text-text-muted">
              {SCAN_LOG.slice(0, logIndex + 1).map((line, i) => (
                <div key={line} className="flex items-center gap-2">
                  <span
                    className={
                      i === logIndex ? "text-primary animate-blink" : "text-primary"
                    }
                  >
                    &gt;
                  </span>
                  {line}
                </div>
              ))}
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="mt-8 rounded-xl border border-danger p-6">
            <div className="flex items-center gap-2 text-danger">
              <IconAlert className="h-4 w-4" />
              <span className="font-heading text-sm font-bold">Couldn&apos;t diagnose</span>
            </div>
            <p className="mt-2 font-body text-sm text-text-muted">{error}</p>
          </div>
        )}

        {status === "done" && result && (
          <div className={`mt-8 rounded-xl border ${toneClass ?? "border-border"} bg-bg-elevated`}>
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div className={`flex items-center gap-2 ${toneClass ?? ""}`}>
                <ResultIcon mode={result.mode} />
                <span className="font-heading text-sm font-bold tracking-wide">
                  {STATUS_STYLE[result.mode].label}
                </span>
              </div>
              {result.chainLabel && (
                <span className="font-mono text-xs text-text-faint">
                  {result.chainLabel}
                </span>
              )}
            </div>

            <div className="px-6 py-6">
              <p className="font-mono text-xs text-text-faint truncate">{result.hash}</p>
              <p className="mt-3 font-heading text-lg font-bold leading-snug text-text">
                {result.headline}
              </p>

              <div className="mt-5 rounded-lg border border-border bg-primary-soft/40 p-4">
                <span className="font-mono text-[11px] text-primary">FIX</span>
                <p className="mt-1 font-body text-sm leading-relaxed text-text">
                  {result.fix}
                </p>
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
        )}
      </div>
    </section>
  );
}
