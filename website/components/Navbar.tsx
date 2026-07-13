"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SherpasLogo } from "./SherpasLogo";

const links = [
  { href: "#failure-modes", label: "Failure Modes" },
  { href: "#diagnose", label: "Diagnose" },
  { href: "#approvals", label: "Approvals" },
  { href: "#bridge", label: "Bridge" },
];

/**
 * Statecall-style floating nav: (1) wordmark on the left, (2) a
 * centered rounded-pill container holding the section links with the
 * currently-visible section highlighted by a lime pill, (3) the
 * "Launch" CTA on the right. The pill container is the single most
 * distinctive piece of the reference design's navigation.
 */
export function Navbar() {
  const [activeHref, setActiveHref] = useState<string>("#top");

  useEffect(() => {
    const sectionIds = links.map((l) => l.href.slice(1));

    // Reference line just below the floating navbar, not a thin band mid-viewport —
    // comparing overlap area against a middle band breaks down for short sections
    // sitting flush against a taller neighbor (e.g. #diagnose next to #approvals),
    // where the band can straddle the boundary and "win" for the wrong section.
    const NAV_OFFSET = 96;

    function updateActive() {
      // Re-look up elements on every call rather than once at mount: #diagnose
      // sits inside a <Suspense> boundary (required by useSearchParams), and
      // Next.js swaps in a fresh DOM subtree after the initial reveal — a
      // reference captured at mount would go stale and never match again.
      const els = sectionIds
        .map((id) => document.getElementById(id))
        .filter((el): el is HTMLElement => el !== null);
      if (els.length === 0) return;

      let current = els[0];
      for (const el of els) {
        if (el.getBoundingClientRect().top <= NAV_OFFSET) current = el;
      }
      setActiveHref(`#${current.id}`);
    }

    updateActive();
    window.addEventListener("scroll", updateActive, { passive: true });
    window.addEventListener("resize", updateActive);
    return () => {
      window.removeEventListener("scroll", updateActive);
      window.removeEventListener("resize", updateActive);
    };
  }, []);

  return (
    <header className="fixed inset-x-0 top-4 z-50 px-4 sm:px-6 lg:px-10">
      <div className="flex items-center justify-center gap-6 md:grid md:grid-cols-[1fr_auto_1fr] md:items-center md:gap-4">
        <Link
          href="#top"
          className="flex items-center gap-2 justify-self-start rounded-full border border-border bg-bg-elevated/60 px-3 py-2 font-wordmark text-[17px] tracking-tighter text-text backdrop-blur-md transition duration-200 ease-out hover:border-primary/40"
        >
          <SherpasLogo className="h-9 w-9" />
          <span className="leading-none pr-2">
            SHERPAS AGENT <span className="text-primary">ASP</span>
          </span>
        </Link>

        <nav className="hidden items-center justify-self-center gap-1 rounded-full border border-border bg-bg-elevated/60 px-2 py-2 backdrop-blur-md md:flex">
          {links.map((link) => {
            const active = link.href === activeHref;
            return (
              <a
                key={link.href}
                href={link.href}
                className={
                  active
                    ? "rounded-full bg-primary px-4 py-1.5 font-body text-sm font-semibold text-bg shadow-[0_0_24px_-4px_rgba(198,226,79,0.6)] transition duration-200"
                    : "rounded-full px-4 py-1.5 font-body text-sm text-text-muted transition duration-200 hover:bg-primary-soft hover:text-text"
                }
              >
                {link.label}
              </a>
            );
          })}
        </nav>

        <a
          href="#diagnose"
          className="cursor-pointer inline-block justify-self-end rounded-full border border-primary bg-primary px-5 py-2.5 font-body text-sm font-semibold text-bg shadow-[0_0_32px_-6px_rgba(198,226,79,0.55)] transition duration-200 ease-out will-change-transform hover:bg-primary-hover hover:border-primary-hover hover:scale-105 hover:shadow-[0_0_40px_-4px_rgba(198,226,79,0.75)]"
        >
          Launch
        </a>
      </div>
    </header>
  );
}
