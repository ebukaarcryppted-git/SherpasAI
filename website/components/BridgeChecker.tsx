"use client";

import { useState, type FormEvent } from "react";
import { IconAlert, IconArrowRight, IconBridge, IconCheck } from "./icons";

interface BridgeDiagnosisJSON {
  headline: string;
  fix: string;
  details: Record<string, string>;
}

const STATUS_TONE: Record<string, string> = {
  in_transit: "border-warning text-warning",
  source_pending: "border-warning text-warning",
  needs_claim: "border-warning text-warning",
  stuck: "border-danger text-danger",
  likely_completed: "border-success text-success",
  unknown: "border-border text-text-muted",
};

export function BridgeChecker() {
  const [hash, setHash] = useState("");
  const [recipient, setRecipient] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<BridgeDiagnosisJSON | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!hash.trim() || !recipient.trim()) return;

    setStatus("loading");
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hash: hash.trim(), recipient: recipient.trim() }),
        signal: AbortSignal.timeout(20_000),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Bridge check failed.");
      setResult(data as BridgeDiagnosisJSON);
      setStatus("done");
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "TimeoutError";
      setError(
        timedOut
          ? "This is taking too long — the chain RPC isn't responding. Try again in a moment."
          : err instanceof Error
            ? err.message
            : "Something went wrong."
      );
      setStatus("error");
    }
  }

  const tone = result ? STATUS_TONE[result.details.Status] ?? "border-border text-text" : "";

  return (
    <section id="bridge" className="px-4 py-24 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <span className="font-mono text-xs text-primary">{"// BRIDGE STATUS"}</span>
          <h2 className="mt-4 font-heading text-3xl font-bold tracking-tight text-text sm:text-4xl">
            Is my bridge transfer stuck?
          </h2>
          <p className="mt-3 font-body text-text-muted">
            Checks source-chain confirmation and elapsed time to tell you if funds are still in
            transit, need a manual claim, or look genuinely stuck.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-10 space-y-3">
          <div className="flex items-center gap-2 rounded-full border border-border bg-bg-elevated/70 px-5 py-3.5 backdrop-blur-md focus-within:border-primary transition-colors duration-200">
            <IconBridge className="h-4 w-4 shrink-0 text-text-faint" />
            <input
              value={hash}
              onChange={(e) => setHash(e.target.value)}
              placeholder="0x… source-chain transaction hash"
              aria-label="Source transaction hash"
              className="w-full bg-transparent font-mono text-base text-text placeholder:text-text-faint focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border bg-bg-elevated/70 px-5 py-3.5 backdrop-blur-md focus-within:border-primary transition-colors duration-200">
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="0x… recipient address on the destination chain"
              aria-label="Recipient address"
              className="w-full bg-transparent font-mono text-base text-text placeholder:text-text-faint focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={status === "loading"}
            className="cursor-pointer flex w-full items-center justify-center gap-2 rounded-full border border-primary bg-primary px-7 py-3.5 font-body text-base font-semibold text-bg shadow-[0_0_32px_-6px_rgba(198,226,79,0.55)] transition duration-200 ease-out will-change-transform hover:bg-primary-hover hover:border-primary-hover hover:scale-105 hover:shadow-[0_0_40px_-4px_rgba(198,226,79,0.75)] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {status === "loading" ? "Checking both chains…" : "Check bridge status"}
            {status !== "loading" && <IconArrowRight className="h-4 w-4" />}
          </button>
        </form>

        {status === "error" && (
          <div className="mt-8 rounded-2xl border border-danger bg-bg-elevated/70 p-6 backdrop-blur-md">
            <div className="flex items-center gap-2 text-danger">
              <IconAlert className="h-4 w-4" />
              <span className="font-heading text-base font-bold">Couldn&apos;t check status</span>
            </div>
            <p className="mt-2 font-body text-sm text-text-muted">{error}</p>
          </div>
        )}

        {status === "done" && result && (
          <div className={`mt-8 overflow-hidden rounded-2xl border ${tone} bg-bg-elevated/70 backdrop-blur-md shadow-[0_0_40px_-16px_rgba(198,226,79,0.25)]`}>
            <div className={`flex items-center gap-2 border-b border-border px-6 py-4 ${tone}`}>
              {result.details.Status === "likely_completed" ? (
                <IconCheck className="h-4 w-4" />
              ) : (
                <IconAlert className="h-4 w-4" />
              )}
              <span className="font-heading text-base font-bold tracking-wide">
                {result.details.Status?.replace(/_/g, " ").toUpperCase()}
              </span>
            </div>
            <div className="px-6 py-6">
              <p className="font-heading text-xl font-bold leading-snug text-text">
                {result.headline}
              </p>
              <div className="mt-5 rounded-lg border border-border bg-primary-soft/40 p-4">
                <span className="font-mono text-[11px] text-primary">FIX</span>
                <p className="mt-1 font-body text-sm leading-relaxed text-text">{result.fix}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
