import { IconLayers } from "./icons";

export function Footer() {
  return (
    <footer className="px-4 py-12">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 border-t border-border pt-8 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2 font-heading text-sm font-bold text-text">
          <span className="flex h-6 w-6 items-center justify-center rounded-md border border-border-strong bg-primary-soft text-primary">
            <IconLayers className="h-3.5 w-3.5" />
          </span>
          SHERPAS AGENT ASP
        </div>
        <p className="font-mono text-xs text-text-faint">
          Diagnosis tool, not a helpdesk. Built for X Layer · OKX.AI Agent Payments Protocol.
        </p>
      </div>
    </footer>
  );
}
