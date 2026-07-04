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
          <span className="font-mono text-xs text-primary">{"// COMPOSABLE BY DESIGN"}</span>
          <h2 className="mt-4 max-w-2xl font-heading text-3xl font-bold tracking-tight text-text sm:text-4xl">
            Built to be hired, not just used
          </h2>
        </ScrollReveal>

        <div className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-3">
          {ITEMS.map((item, i) => (
            <ScrollReveal key={item.title} delay={i * 80}>
              <div className="rounded-xl border border-border p-7">
                <item.icon className="h-6 w-6 text-primary" />
                <h3 className="mt-5 font-heading text-lg font-bold text-text">
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
