export const metadata = {
  title: "Sherpas Agent: Diagnose a transaction",
  robots: { index: false },
};

/**
 * Bare-bones layout for the embeddable widget. No navbar/hero/marketing
 * chrome — this is what protocols iframe into their own support surface,
 * e.g. <iframe src="https://<your-deploy>/embed" />.
 */
export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-bg">{children}</div>;
}
