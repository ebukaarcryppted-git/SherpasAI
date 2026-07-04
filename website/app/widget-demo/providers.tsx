"use client";

import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http, mock, useAccount, useConnect } from "wagmi";

/**
 * Demo-only wagmi setup using wagmi's built-in mock connector (no real
 * wallet extension needed) so /widget-demo can render the real
 * SupportWidget component tree — including its wagmi hooks — in a plain
 * browser preview.
 */
const XLAYER_DEMO_CHAIN = {
  id: 196,
  name: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.xlayer.tech"] } },
} as const;

const mockConnector = mock({
  accounts: ["0x1234567890123456789012345678901234567890"],
});

const config = createConfig({
  chains: [XLAYER_DEMO_CHAIN],
  connectors: [mockConnector],
  transports: { [XLAYER_DEMO_CHAIN.id]: http() },
});

const queryClient = new QueryClient();

/**
 * The mock connector's own `defaultConnected`/`reconnect` features rely on
 * wagmi's reconnect-on-mount flow, which got stuck in a permanent
 * "connecting" status here (never resolving) — likely a timing conflict
 * with Next.js hydration. Connecting explicitly in a client effect is more
 * reliable for this demo harness: it sidesteps wagmi's automatic
 * reconnection path entirely and just directly connects once, after mount.
 */
function AutoConnectMock({ children }: { children: React.ReactNode }) {
  const { isConnected } = useAccount();
  const { connect, status } = useConnect();
  useEffect(() => {
    if (isConnected || status !== "idle") return;
    // Deferred a tick past mount so the connect-triggered store update lands
    // after Next.js finishes hydrating, rather than racing it.
    const id = setTimeout(() => connect({ connector: mockConnector }), 0);
    return () => clearTimeout(id);
  }, [isConnected, status, connect]);
  return <>{children}</>;
}

export function WidgetDemoProviders({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <AutoConnectMock>{children}</AutoConnectMock>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
