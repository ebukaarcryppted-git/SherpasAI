"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { IconArrowRight, IconSearch } from "./icons";
import { DiagnosisResult } from "./DiagnosisResult";
import { useDiagnosis } from "@/lib/useDiagnosis";

export function DiagnosisWidget() {
  const searchParams = useSearchParams();
  const [value, setValue] = useState("");
  const { status, result, error, logIndex, runDiagnosis } = useDiagnosis();

  useEffect(() => {
    const tx = searchParams.get("tx");
    if (tx) {
      // Syncing widget state from a shareable ?tx= URL param (e.g. #diagnose deep link).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValue(tx);
      runDiagnosis(tx);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!value.trim() || status === "loading") return;
    runDiagnosis(value.trim());
  }

  return (
    <section id="diagnose" className="px-4 py-24 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <span className="font-mono text-xs text-primary">{"// TRY IT LIVE"}</span>
          <h2 className="mt-4 font-heading text-4xl font-bold tracking-tight text-text sm:text-5xl">
            Run a real diagnosis
          </h2>
          <p className="mt-3 font-body text-text-muted">
            Live RPC reads across Ethereum and X Layer. Paste any real tx hash
            from <span className="font-mono text-text">chain 1</span> or{" "}
            <span className="font-mono text-text">chain 196</span>.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-10 flex flex-col gap-3 sm:flex-row">
          <div className="flex flex-1 items-center gap-2 rounded-full border border-border bg-bg-elevated/70 px-5 py-3.5 backdrop-blur-md focus-within:border-primary transition-colors duration-200">
            <IconSearch className="h-4 w-4 shrink-0 text-text-faint" />
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0x…"
              aria-label="Transaction hash"
              className="w-full bg-transparent font-mono text-base text-text placeholder:text-text-faint focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={status === "loading"}
            className="cursor-pointer flex items-center justify-center gap-2 rounded-full border border-primary bg-primary px-7 py-3.5 font-body text-base font-semibold text-bg transition duration-200 ease-out will-change-transform hover:bg-primary-hover hover:border-primary-hover hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "loading" ? "Reading chain…" : "Diagnose"}
            {status !== "loading" && <IconArrowRight className="h-4 w-4" />}
          </button>
        </form>

        <DiagnosisResult status={status} result={result} error={error} logIndex={logIndex} />
      </div>
    </section>
  );
}
