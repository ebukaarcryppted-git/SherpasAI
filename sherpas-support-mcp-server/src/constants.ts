export const SERVER_NAME = "sherpas-support-mcp-server";
export const SERVER_VERSION = "0.1.0";

export const SERVER_DESCRIPTION =
  "Diagnoses failed (or confirms successful) onchain transactions on X Layer and Ethereum by reading live chain state — slippage, allowances, wrong network, gas, nonce, and bridge status — and classifying the failure via a deterministic rule engine.";

/** Default HTTP port for the streamable-HTTP transport, overridable via PORT env var. */
export const DEFAULT_HTTP_PORT = 3333;

/** Path the streamable HTTP transport listens on. */
export const MCP_HTTP_PATH = "/mcp";
