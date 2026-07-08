import { SherpasLogo } from "./SherpasLogo";

function IconX({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function IconGithub({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.09 3.29 9.4 7.86 10.94.57.1.78-.25.78-.55 0-.27-.01-1.15-.02-2.09-3.2.7-3.88-1.36-3.88-1.36-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.73 1.27 3.4.97.1-.75.41-1.27.74-1.56-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 2.9-.39c.98 0 1.97.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.43-2.69 5.41-5.25 5.69.42.36.79 1.09.79 2.2 0 1.59-.01 2.87-.01 3.26 0 .3.2.66.79.55C20.71 21.39 24 17.08 24 12c0-6.27-5.23-11.5-12-11.5Z" />
    </svg>
  );
}

const ECOSYSTEM_LINKS = [
  { label: "X Layer X Page", href: "https://x.com/XLayerOfficial" },
  { label: "OKX.AI", href: "https://www.okx.ai/tutorial/asp" },
  { label: "Etherscan", href: "https://etherscan.io/" },
  { label: "X Layer Explorer", href: "https://web3.okx.com/explorer/x-layer/evm" },
];

const RESOURCES_LINKS = [
  { label: "Onchain OS", href: "https://web3.okx.com/onchainos" },
  { label: "About X Layer", href: "https://web3.okx.com/xlayer" },
];

function FooterLinkColumn({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <span className="font-heading text-lg font-bold tracking-tight text-text">
        {title}
      </span>
      <ul className="mt-4 space-y-2.5">
        {links.map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-heading text-sm font-bold tracking-tight text-text-muted transition-colors duration-200 hover:text-primary"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

const socialLinkClass =
  "inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-bg-elevated/70 text-text-muted backdrop-blur-md transition duration-200 ease-out will-change-transform hover:scale-110 hover:border-primary hover:text-primary hover:shadow-[0_0_24px_-4px_rgba(198,226,79,0.5)]";

export function Footer() {
  return (
    <footer className="px-4 py-12 sm:px-6 lg:px-10">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-10 border-t border-border pt-8 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col items-start gap-3">
          <div className="flex items-center gap-3">
            <SherpasLogo className="h-10 w-10 shrink-0" />
            <span className="whitespace-nowrap font-wordmark text-lg leading-none tracking-tighter text-text">
              SHERPAS AGENT <span className="text-primary">ASP</span>
            </span>
            <a
              href="https://x.com/sherpasai"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Sherpas AI on X"
              className={socialLinkClass}
            >
              <IconX className="h-4 w-4" />
            </a>
            <a
              href="https://github.com/ebukaarcryppted-git/SherpasAI"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Sherpas AI on GitHub"
              className={socialLinkClass}
            >
              <IconGithub className="h-4 w-4" />
            </a>
          </div>

          <p className="max-w-md font-mono text-xs leading-relaxed text-text-faint">
            Diagnosis tool, not a helpdesk.
            <br />
            Built for Ethereum &amp; X Layer · OKX.AI Agent Payments Protocol.
          </p>
        </div>

        <div className="flex gap-16 sm:gap-20">
          <FooterLinkColumn title="Ecosystem" links={ECOSYSTEM_LINKS} />
          <FooterLinkColumn title="Resources" links={RESOURCES_LINKS} />
        </div>
      </div>
    </footer>
  );
}
