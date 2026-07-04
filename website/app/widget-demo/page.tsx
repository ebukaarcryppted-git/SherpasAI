"use client";

import { SupportWidget } from "@support-agent-asp/widget";
import { WidgetDemoProviders } from "./providers";

const FIXTURE_HASHES = [
  { hash: "0x000000000000000000000000000000000000000000000000000000000000c001", label: "Healthy (NOT_A_FAILURE)" },
  { hash: "0x000000000000000000000000000000000000000000000000000000000000c002", label: "Wrong network" },
  { hash: "0x000000000000000000000000000000000000000000000000000000000000c003", label: "Nonce gap" },
  { hash: "0x000000000000000000000000000000000000000000000000000000000000c004", label: "Nonce already used" },
  { hash: "0x000000000000000000000000000000000000000000000000000000000000c005", label: "Gas underpriced" },
  { hash: "0x000000000000000000000000000000000000000000000000000000000000c006", label: "Slippage revert" },
  { hash: "0x000000000000000000000000000000000000000000000000000000000000c007", label: "Insufficient allowance" },
  { hash: "0x000000000000000000000000000000000000000000000000000000000000c008", label: "Bridge stuck (needs manual claim)" },
  { hash: "0x000000000000000000000000000000000000000000000000000000000000c009", label: "Unknown / low confidence" },
];

export default function WidgetDemoPage() {
  return (
    <WidgetDemoProviders>
      <div style={{ minHeight: "100vh", background: "#f4f4f5", padding: 40, fontFamily: "system-ui, sans-serif" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#111" }}>SupportWidget demo harness</h1>
        <p style={{ color: "#555", maxWidth: 560, lineHeight: 1.5 }}>
          Renders the real widget against a mock MCP endpoint. Click the icon bottom-right, then paste one of these
          test hashes to see each card:
        </p>
        <ul style={{ color: "#333", fontFamily: "monospace", fontSize: 12, lineHeight: 1.8 }}>
          {FIXTURE_HASHES.map((f) => (
            <li key={f.hash}>
              {f.hash} — {f.label}
            </li>
          ))}
        </ul>

        <SupportWidget expectedChainId={196} mcpEndpoint="/api/mock-mcp" supportUrl="https://example.com/support" />
      </div>
    </WidgetDemoProviders>
  );
}
