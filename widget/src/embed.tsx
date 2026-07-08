import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http, injected } from "wagmi";
import { mainnet } from "wagmi/chains";
import { SupportWidget } from "./SupportWidget.js";

/**
 * Vanilla script-tag entry for non-React dApps:
 *   <script src=".../widget.js" data-chain-id="196" data-mcp-endpoint="https://.../mcp"></script>
 *
 * A React-hosted page supplies its own WagmiProvider (the widget assumes
 * one exists, per the npm-package path in SupportWidget.tsx). A plain HTML
 * page has none, so this entry bootstraps a minimal one — an injected
 * (browser-extension wallet) connector against the target chain — before
 * mounting the exact same SupportWidget component. One component, two
 * mounting paths, per the spec's integration model.
 */

function currentScript(): HTMLScriptElement | null {
  if (document.currentScript instanceof HTMLScriptElement) return document.currentScript;
  const scripts = document.querySelectorAll("script[data-chain-id], script[data-mcp-endpoint]");
  return (scripts[scripts.length - 1] as HTMLScriptElement) ?? null;
}

function readConfig() {
  const script = currentScript();
  const chainId = Number(script?.dataset.chainId ?? "196");
  const mcpEndpoint = script?.dataset.mcpEndpoint;
  const supportUrl = script?.dataset.supportUrl;

  // Comma-separated list, e.g. `data-supported-chain-ids="1,196"`. Omit to
  // fall back to the widget's built-in default (Ethereum + X Layer). Bad
  // values are dropped rather than throwing at script-tag load time.
  const supportedChainIds = script?.dataset.supportedChainIds
    ?.split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (!mcpEndpoint) {
    throw new Error("SupportWidget embed: data-mcp-endpoint is required on the <script> tag.");
  }

  return { chainId, mcpEndpoint, supportUrl, supportedChainIds };
}

function mount() {
  const { chainId, mcpEndpoint, supportUrl, supportedChainIds } = readConfig();

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.bottom = "20px";
  container.style.right = "20px";
  container.style.zIndex = "2147483647"; // above virtually anything a host page could set
  document.body.appendChild(container);

  const wagmiConfig = createConfig({
    chains: [{ ...mainnet, id: chainId, name: `Chain ${chainId}` }],
    connectors: [injected()],
    transports: { [chainId]: http() },
  });

  const queryClient = new QueryClient();

  createRoot(container).render(
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SupportWidget
          expectedChainId={chainId}
          mcpEndpoint={mcpEndpoint}
          supportUrl={supportUrl}
          supportedChainIds={supportedChainIds}
        />
      </QueryClientProvider>
    </WagmiProvider>
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}
