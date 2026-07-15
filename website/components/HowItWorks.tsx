import { ScrollReveal } from "./ScrollReveal";

const STEPS = [
  {
    n: "01",
    title: "Paste the hash",
    body: "Drop in a transaction hash or connect the wallet that saw the failure. No account, no setup.",
  },
  {
    n: "02",
    title: "We read the chain",
    body: "Live viem calls against Ethereum and X Layer pull the tx, receipt, allowances, gas conditions, and nonce state, the same data a human would dig through a block explorer for.",
  },
  {
    n: "03",
    title: "Get the fix",
    body: "One plain-language sentence explaining what happened, and the concrete action to take next.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-y border-border px-4 py-24 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-[1400px]">
        <ScrollReveal>
          <div className="text-center">
            <span className="font-mono text-xs text-primary">
              {"// FROM TICKET TO ANSWER"}
            </span>
            <h2 className="mt-4 font-heading text-4xl font-bold tracking-tight text-text sm:text-5xl">
              What took a human 10 minutes takes this 3 seconds
            </h2>
          </div>
        </ScrollReveal>

        <div className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step, i) => (
            <ScrollReveal key={step.n} delay={i * 100}>
              <div className="group h-full rounded-2xl border border-border bg-bg-elevated/60 p-7 backdrop-blur-md transition duration-300 ease-out will-change-transform hover:bg-bg-elevated-2/70 hover:scale-[1.02] hover:-translate-y-1 hover:border-primary/50 hover:shadow-[0_0_40px_-8px_rgba(198,226,79,0.35)]">
                <div className="font-heading text-5xl font-bold text-primary-soft">
                  {step.n}
                </div>
                <h3 className="mt-5 font-heading text-2xl font-bold text-text">
                  {step.title}
                </h3>
                <p className="mt-2 font-body text-sm leading-relaxed text-text-muted">
                  {step.body}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
