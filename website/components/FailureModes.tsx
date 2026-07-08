import {
  IconSlippage,
  IconAllowance,
  IconNetwork,
  IconBridge,
  IconGas,
  IconNonce,
} from "./icons";
import { ScrollReveal } from "./ScrollReveal";

const MODES = [
  {
    icon: IconSlippage,
    tag: "01",
    title: "Slippage revert",
    body: "Price moved past your tolerance mid-swap. We decode the revert reason and tell you exactly how much room to give it.",
  },
  {
    icon: IconAllowance,
    tag: "02",
    title: "Insufficient allowance",
    body: "The router never got approval to spend, or not enough of it. We read the allowance directly off-chain.",
  },
  {
    icon: IconNetwork,
    tag: "03",
    title: "Wrong network",
    body: "Tx sent on a chain that doesn't match what your wallet or dApp expected. We scan every chain the hash could live on.",
  },
  {
    icon: IconBridge,
    tag: "04",
    title: "Stuck bridge transfer",
    body: "Funds left the source chain but haven't landed yet. We check confirmation status on both sides.",
  },
  {
    icon: IconGas,
    tag: "05",
    title: "Gas too low",
    body: "Underpriced against current network conditions, sitting in the mempool. We compare against live base fee.",
  },
  {
    icon: IconNonce,
    tag: "06",
    title: "Nonce issue",
    body: "An earlier tx never confirmed, blocking everything queued behind it. We surface the exact gap.",
  },
];

export function FailureModes() {
  return (
    <section id="failure-modes" className="px-4 py-24">
      <div className="mx-auto max-w-6xl">
        <ScrollReveal>
          <div className="mx-auto max-w-2xl text-center">
            <span className="font-mono text-xs text-primary">
              {"// THE 6 THAT MATTER MOST"}
            </span>
            <h2 className="mt-4 font-heading text-3xl font-bold tracking-tight text-text sm:text-4xl">
              Six failure modes, diagnosed perfectly
            </h2>
            <p className="mt-4 font-body text-text-muted leading-relaxed">
              Not a generic FAQ bot. Six patterns nailed completely, each
              backed by a real read of chain state — not a guess.
            </p>
          </div>
        </ScrollReveal>

        <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODES.map((mode, i) => (
            <ScrollReveal key={mode.title} delay={i * 60}>
              <div className="group h-full rounded-2xl border border-border bg-bg-elevated/60 p-7 backdrop-blur-md transition duration-300 ease-out will-change-transform hover:bg-bg-elevated-2/70 hover:scale-[1.02] hover:-translate-y-1 hover:border-primary/50 hover:shadow-[0_0_40px_-8px_rgba(198,226,79,0.35)]">
                <div className="flex items-start justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-border-strong bg-primary-soft text-primary transition-colors duration-200 group-hover:bg-primary group-hover:text-bg">
                    <mode.icon className="h-5 w-5" />
                  </span>
                  <span className="font-mono text-xs text-text-faint">
                    {mode.tag}
                  </span>
                </div>
                <h3 className="mt-5 font-heading text-2xl font-bold text-text">
                  {mode.title}
                </h3>
                <p className="mt-2 font-body text-sm leading-relaxed text-text-muted">
                  {mode.body}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
