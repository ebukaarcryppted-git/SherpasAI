import { IconLayers, IconShield, IconWallet } from "./icons";
import { ScrollReveal } from "./ScrollReveal";

const ITEMS = [
  {
    icon: IconLayers,
    title: "Hire it as a sub-task",
    body: "A protocol's own support agent can call this ASP mid-conversation via OKX.AI's Agent Payments Protocol — no integration beyond one API call.",
  },
  {
    icon: IconShield,
    title: "Chain a risk check first",
    body: "Before returning wallet-drain advice, this agent can call a risk-scoring ASP to verify the fix itself isn't steering a user into a scam contract.",
  },
  {
    icon: IconWallet,
    title: "Pay per diagnosis",
    body: "Flat fee settled per completed diagnosis through the Agent Payments Protocol. No subscription, no seat licenses.",
  },
];

export function Composability() {
  return (
    <section className="border-y border-border px-4 py-24">
      <div className="mx-auto max-w-6xl">
        <ScrollReveal>
          <div className="text-center">
            <span className="font-mono text-xs text-primary">{"// COMPOSABLE BY DESIGN"}</span>
            <h2 className="mt-4 font-heading text-3xl font-bold tracking-tight text-text sm:text-4xl">
              Built to be hired, not just used
            </h2>
          </div>
        </ScrollReveal>

        <div className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-3">
          {ITEMS.map((item, i) => (
            <ScrollReveal key={item.title} delay={i * 80}>
              <div className="group h-full rounded-2xl border border-border bg-bg-elevated/60 p-7 backdrop-blur-md transition duration-300 ease-out will-change-transform hover:bg-bg-elevated-2/70 hover:scale-[1.02] hover:-translate-y-1 hover:border-primary/50 hover:shadow-[0_0_40px_-8px_rgba(198,226,79,0.35)]">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-border-strong bg-primary-soft text-primary transition-colors duration-200 group-hover:bg-primary group-hover:text-bg">
                  <item.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-5 font-heading text-2xl font-bold text-text">
                  {item.title}
                </h3>
                <p className="mt-2 font-body text-sm leading-relaxed text-text-muted">
                  {item.body}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
