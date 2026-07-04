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
    body: "Live viem calls against X Layer pull the tx, receipt, allowances, gas conditions, and nonce state — the same data a human would dig through Etherscan for.",
  },
  {
    n: "03",
    title: "Get the fix",
    body: "One plain-language sentence explaining what happened, and the concrete action to take next.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-y border-border px-4 py-24">
      <div className="mx-auto max-w-6xl">
        <ScrollReveal>
          <span className="font-mono text-xs text-primary">
            {"// FROM TICKET TO ANSWER"}
          </span>
          <h2 className="mt-4 font-heading text-3xl font-bold tracking-tight text-text sm:text-4xl">
            What took a human 10 minutes takes this 3 seconds
          </h2>
        </ScrollReveal>

        <div className="mt-16 grid grid-cols-1 gap-10 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <ScrollReveal key={step.n} delay={i * 100}>
              <div className="relative">
                <div className="font-heading text-5xl font-bold text-primary-soft">
                  {step.n}
                </div>
                <h3 className="mt-4 font-heading text-xl font-bold text-text">
                  {step.title}
                </h3>
                <p className="mt-3 font-body text-sm leading-relaxed text-text-muted">
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
