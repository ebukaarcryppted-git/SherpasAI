"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { IconArrowRight, IconSearch } from "./icons";

export function Hero() {
  const router = useRouter();
  const [value, setValue] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    const target = trimmed
      ? `/?tx=${encodeURIComponent(trimmed)}#diagnose`
      : "#diagnose";
    router.push(target);
    document.getElementById("diagnose")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <section id="top" className="relative overflow-hidden px-4 pt-40 pb-8">
      <div className="mx-auto max-w-5xl">
        <div className="animate-fade-up flex items-center gap-2 rounded-full border border-border bg-bg-elevated px-3 py-1.5 w-fit font-mono text-xs text-primary">
          <span className="h-1.5 w-1.5 bg-primary animate-blink" />
          LIVE ON X LAYER · CHAIN 196
        </div>

        <h1
          className="animate-fade-up mt-8 max-w-4xl font-heading text-5xl font-bold leading-[1.05] tracking-tight text-text sm:text-6xl md:text-7xl"
          style={{ animationDelay: "80ms" }}
        >
          Know why your transaction failed. In three seconds.
        </h1>

        <p
          className="animate-fade-up mt-6 max-w-2xl font-body text-lg leading-relaxed text-text-muted"
          style={{ animationDelay: "160ms" }}
        >
          Paste a transaction hash. We read the actual chain state — slippage,
          allowances, network, bridge status, gas, nonce — and hand back a
          plain-language diagnosis and the exact fix. No ticket, no waiting on
          a human to open Etherscan.
        </p>

        <form
          onSubmit={handleSubmit}
          className="animate-fade-up mt-10 flex max-w-2xl flex-col gap-3 sm:flex-row"
          style={{ animationDelay: "240ms" }}
        >
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-bg-elevated px-4 py-3.5 focus-within:border-primary transition-colors duration-200">
            <IconSearch className="h-4 w-4 shrink-0 text-text-faint" />
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0x8f3a2b... paste a failed tx hash"
              aria-label="Transaction hash"
              className="w-full bg-transparent font-mono text-sm text-text placeholder:text-text-faint focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="cursor-pointer flex items-center justify-center gap-2 rounded-lg border border-primary bg-primary px-6 py-3.5 font-heading text-sm font-bold text-bg transition-colors duration-200 hover:bg-primary-hover hover:border-primary-hover"
          >
            Diagnose
            <IconArrowRight className="h-4 w-4" />
          </button>
        </form>
      </div>
    </section>
  );
}
