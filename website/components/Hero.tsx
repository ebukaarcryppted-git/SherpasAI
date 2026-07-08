"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { IconArrowRight, IconSearch } from "./icons";
import { WaveText } from "./WaveText";

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
    <section id="top" className="relative flex min-h-[92vh] items-center overflow-hidden px-4 pt-40 pb-12 sm:px-6 lg:px-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center opacity-20"
      >
        <Image
          src="/logo.png"
          alt=""
          width={514}
          height={466}
          priority
          className="h-auto w-full max-w-[720px] object-contain"
        />
      </div>

      <div className="relative mx-auto w-full max-w-[1400px]">
        <h1
          className="animate-fade-up max-w-5xl font-heading text-6xl font-bold uppercase leading-[1.03] tracking-tight text-text sm:text-7xl md:text-[5.5rem]"
          style={{ animationDelay: "80ms" }}
        >
          <WaveText>{"Know why your transaction failed."}</WaveText>{" "}
          <span className="inline-flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono text-primary">{"{"}</span>
            <WaveText className="text-primary">In three seconds.</WaveText>
            <span className="font-mono text-primary">{"}"}</span>
          </span>
        </h1>

        <p
          className="animate-fade-up mt-8 max-w-3xl font-body text-xl leading-relaxed text-text md:text-2xl"
          style={{ animationDelay: "160ms" }}
        >
          Paste a transaction hash.
          <br />
          We read the actual chain state; slippage, allowances, network,
          bridge status, gas, nonce and give you a natural plain-language
          diagnosis and the exact fix. No ticket, No waiting on a human to
          open Etherscan.
        </p>

        <form
          onSubmit={handleSubmit}
          className="animate-fade-up mt-10 flex max-w-3xl flex-col gap-3 sm:flex-row"
          style={{ animationDelay: "240ms" }}
        >
          <div className="flex flex-1 items-center gap-2 rounded-full border border-border bg-bg-elevated/70 px-5 py-3.5 backdrop-blur-md focus-within:border-primary transition-colors duration-200">
            <IconSearch className="h-4 w-4 shrink-0 text-text-faint" />
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0x8f3a2b... paste a failed tx hash"
              aria-label="Transaction hash"
              className="w-full bg-transparent font-mono text-base text-text placeholder:text-text-faint focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="cursor-pointer flex items-center justify-center gap-2 rounded-full border border-primary bg-primary px-7 py-3.5 font-body text-base font-semibold text-bg shadow-[0_0_32px_-6px_rgba(198,226,79,0.55)] transition duration-200 ease-out will-change-transform hover:bg-primary-hover hover:border-primary-hover hover:scale-105 hover:shadow-[0_0_40px_-4px_rgba(198,226,79,0.75)]"
          >
            Diagnose
            <IconArrowRight className="h-4 w-4" />
          </button>
        </form>
      </div>
    </section>
  );
}
