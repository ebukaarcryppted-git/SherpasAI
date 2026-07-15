"use client";

import { useEffect, useState } from "react";
import type { Diagnosis } from "@support-agent-asp/agent-core";

export const SCAN_LOG = [
  "resolving transaction across Ethereum + X Layer…",
  "reading receipt + trace…",
  "checking allowance / gas / nonce state…",
  "classifying against known failure patterns…",
];

export type DiagnosisStatus = "idle" | "loading" | "done" | "error";

/**
 * Shared "call /api/diagnose and track the result" logic, used by both the
 * Hero form (inline result, no navigation) and the dedicated #diagnose
 * section further down the page.
 */
export function useDiagnosis() {
  const [status, setStatus] = useState<DiagnosisStatus>("idle");
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
        signal: AbortSignal.timeout(20_000),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Diagnosis failed.");
      setResult(data as Diagnosis);
      setStatus("done");
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "TimeoutError";
      setError(
        timedOut
          ? "This is taking too long. The chain RPC isn't responding. Try again in a moment."
          : err instanceof Error
            ? err.message
            : "Something went wrong."
      );
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

  return { status, result, error, logIndex, runDiagnosis };
}
