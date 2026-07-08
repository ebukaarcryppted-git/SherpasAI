"use client";

import { useState, type FormEvent } from "react";
import { IconAlert, IconArrowRight, IconCheck, IconShield } from "./icons";

interface ApprovalFindingJSON {
  token: string;
  tokenSymbol: string;
  spender: string;
  allowance: string;
  unlimited: boolean;
  risk: "unlimited" | "limited" | "none";
}

interface ApprovalReportJSON {
  summary: string;
  riskyCount: number;
  recommendations: string[];
  findings: ApprovalFindingJSON[];
}

export function ApprovalChecker() {
  const [address, setAddress] = useState("");
  const [tokens, setTokens] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [report, setReport] = useState<ApprovalReportJSON | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const tokenList = tokens
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    if (!address.trim() || tokenList.length === 0) return;

    setStatus("loading");
    setError(null);
    setReport(null);

    try {
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: address.trim(), tokens: tokenList }),
        signal: AbortSignal.timeout(20_000),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Approval scan failed.");
      setReport(data as ApprovalReportJSON);
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

  return (
    <section id="approvals" className="border-y border-border px-4 py-24">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <span className="font-mono text-xs text-primary">{"// APPROVAL HYGIENE"}</span>
          <h2 className="mt-4 font-heading text-3xl font-bold tracking-tight text-text sm:text-4xl">
            Why is my wallet draining?
          </h2>
          <p className="mt-3 font-body text-text-muted">
            Scans real Approval events for the tokens you list, then reads today&apos;s live
            allowance for every spender that&apos;s ever been approved.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-10 space-y-3">
          <div className="flex items-center gap-2 rounded-full border border-border bg-bg-elevated/70 px-5 py-3.5 backdrop-blur-md focus-within:border-primary transition-colors duration-200">
            <IconShield className="h-4 w-4 shrink-0 text-text-faint" />
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="0x… wallet address"
              aria-label="Wallet address"
              className="w-full bg-transparent font-mono text-base text-text placeholder:text-text-faint focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border bg-bg-elevated/70 px-5 py-3.5 backdrop-blur-md focus-within:border-primary transition-colors duration-200">
            <input
              value={tokens}
              onChange={(e) => setTokens(e.target.value)}
              placeholder="token addresses to check, comma-separated"
              aria-label="Token addresses"
              className="w-full bg-transparent font-mono text-base text-text placeholder:text-text-faint focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={status === "loading"}
            className="cursor-pointer flex w-full items-center justify-center gap-2 rounded-full border border-primary bg-primary px-7 py-3.5 font-body text-base font-semibold text-bg shadow-[0_0_32px_-6px_rgba(198,226,79,0.55)] transition duration-200 ease-out will-change-transform hover:bg-primary-hover hover:border-primary-hover hover:scale-105 hover:shadow-[0_0_40px_-4px_rgba(198,226,79,0.75)] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {status === "loading" ? "Scanning approvals…" : "Scan approvals"}
            {status !== "loading" && <IconArrowRight className="h-4 w-4" />}
          </button>
        </form>

        {status === "error" && (
          <div className="mt-8 rounded-2xl border border-danger bg-bg-elevated/70 p-6 backdrop-blur-md">
            <div className="flex items-center gap-2 text-danger">
              <IconAlert className="h-4 w-4" />
              <span className="font-heading text-base font-bold">Scan failed</span>
            </div>
            <p className="mt-2 font-body text-sm text-text-muted">{error}</p>
          </div>
        )}

        {status === "done" && report && (
          <div
            className={`mt-8 overflow-hidden rounded-2xl border ${report.riskyCount > 0 ? "border-warning" : "border-success"} bg-bg-elevated/70 backdrop-blur-md shadow-[0_0_40px_-16px_rgba(198,226,79,0.25)]`}
          >
            <div className="flex items-center gap-2 border-b border-border px-6 py-4">
              {report.riskyCount > 0 ? (
                <IconAlert className="h-4 w-4 text-warning" />
              ) : (
                <IconCheck className="h-4 w-4 text-success" />
              )}
              <span className="font-heading text-base font-bold text-text">{report.summary}</span>
            </div>

            <div className="divide-y divide-border">
              {report.findings.map((f) => (
                <div key={`${f.token}-${f.spender}`} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <span className="font-heading text-base font-bold text-text">
                      {f.tokenSymbol}
                    </span>
                    <span
                      className={`font-mono text-xs ${f.unlimited ? "text-danger" : "text-text-muted"}`}
                    >
                      {f.unlimited ? "UNLIMITED" : "LIMITED"}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-text-faint">spender {f.spender}</p>
                </div>
              ))}
              {report.findings.length === 0 && (
                <div className="px-6 py-8 text-center font-body text-sm text-text-muted">
                  No active approvals found for the tokens you listed.
                </div>
              )}
            </div>

            {report.recommendations.length > 0 && (
              <div className="border-t border-border bg-primary-soft/40 px-6 py-4">
                <span className="font-mono text-[11px] text-primary">RECOMMENDATIONS</span>
                <ul className="mt-2 space-y-1.5">
                  {report.recommendations.map((rec) => (
                    <li key={rec} className="font-body text-sm leading-relaxed text-text">
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
