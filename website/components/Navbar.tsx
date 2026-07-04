import Link from "next/link";
import { IconLayers } from "./icons";

const links = [
  { href: "#failure-modes", label: "Failure Modes" },
  { href: "#diagnose", label: "Diagnose" },
  { href: "#approvals", label: "Approvals" },
  { href: "#bridge", label: "Bridge" },
];

export function Navbar() {
  return (
    <header className="fixed inset-x-0 top-4 z-50 px-4">
      <div className="mx-auto flex max-w-6xl items-center justify-between rounded-2xl border border-border bg-bg-elevated/90 px-5 py-3 backdrop-blur-sm">
        <Link
          href="#top"
          className="flex items-center gap-2 font-heading text-[15px] font-bold tracking-tight text-text"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-border-strong bg-primary-soft text-primary">
            <IconLayers className="h-4 w-4" />
          </span>
          SHERPAS&nbsp;AGENT
          <span className="text-primary">ASP</span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="font-body text-sm text-text-muted transition-colors duration-200 hover:text-text"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <a
          href="#diagnose"
          className="cursor-pointer rounded-lg border border-primary bg-primary px-4 py-2 font-heading text-sm font-bold text-bg transition-colors duration-200 hover:bg-primary-hover hover:border-primary-hover"
        >
          Launch
        </a>
      </div>
    </header>
  );
}
