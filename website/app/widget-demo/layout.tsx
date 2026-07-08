import { notFound } from "next/navigation";

export const metadata = {
  robots: { index: false, follow: false },
};

/**
 * Internal harness for visually verifying every SupportWidget card/state
 * against canned fixtures (see app/api/mock-mcp/route.ts) — never real
 * chain data. Not linked from the real site nav, but Next.js still serves
 * any route to a direct URL hit, so this shouldn't ship live by default: a
 * visitor who finds it would see fabricated "diagnosis" results with
 * nothing but the page's own copy telling them it's fake. Opt in explicitly
 * per deployment with DEMO_ROUTES_ENABLED=true if you actually want it
 * reachable (e.g. a staging environment).
 */
export default function WidgetDemoLayout({ children }: { children: React.ReactNode }) {
  const isProduction = process.env.NODE_ENV === "production";
  const demoRoutesEnabled = process.env.DEMO_ROUTES_ENABLED === "true";
  if (isProduction && !demoRoutesEnabled) {
    notFound();
  }
  return children;
}
