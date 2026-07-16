import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listSupportedChains } from "../services/onchain-reader.js";
import { runDiagnosis } from "../services/runDiagnosis.js";

const DiagnoseInputSchema = z
  .object({
    txHash: z
      .string()
      .regex(/^0x[a-fA-F0-9]{64}$/, "Must be a valid 32-byte tx hash")
      .describe("The transaction hash to diagnose, e.g. 0xabc123..."),
    chainId: z
      .number()
      .int()
      .positive()
      .describe("Chain ID the tx was submitted on, e.g. 1 for Ethereum mainnet, 196 for X Layer"),
    expectedChainId: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "Optional: chain ID the dApp expected the wallet to be on, enables wrong-network detection without extra RPC calls"
      ),
  })
  .strict();

// Kept loose on evidence/enrichment fields (Record<string, unknown> in the
// underlying LiveDiagnosis type) — the outputSchema documents the tool's
// shape for clients without over-constraining classify.ts's evidence
// payloads, which vary per failure mode by design.
const DiagnoseOutputSchema = z
  .object({
    mode: z.string().describe("The classified failure mode, e.g. SLIPPAGE_REVERT, WRONG_NETWORK, REVERTED_OTHER, NOT_A_FAILURE"),
    confidence: z.number().min(0).max(1).describe("0-1 confidence score for this classification"),
    evidence: z.record(z.string(), z.unknown()).describe("Raw signals that justified the classification"),
    ruleTriggered: z.string().describe("Which internal rule fired — useful for debugging/transparency"),
    healthy: z.boolean().optional().describe("Present and true only when the transaction succeeded with no failure detected"),
    quantifiedSlippage: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Present only for SLIPPAGE_REVERT on a decodable Uniswap V2-style swap — price movement %, tolerance %, amounts"),
    bridgeDeepDive: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Present only for BRIDGE_STUCK when bridge context was supplied — root-cause sub-classification"),
  })
  .strict();

const DESCRIPTION = `Diagnoses why an onchain transaction failed, or confirms it succeeded, by reading live chain state on X Layer and Ethereum.

Reads the transaction, its receipt, the wallet's nonce/gas/allowance state, and (when relevant) bridge status, then classifies the result through a deterministic rule engine — no guessing, no LLM-hallucinated explanations. Supported failure modes: slippage revert, insufficient allowance, wrong network, gas underpriced, nonce gap/already-used, stuck bridge transfer, generic revert with reason surfaced (REVERTED_OTHER), or a plain successful transaction.

Args:
- txHash (required): the transaction hash, as a 66-character 0x-prefixed hex string.
- chainId (required): the chain the transaction was actually submitted on. Currently supported: ${listSupportedChains()}.
- expectedChainId (optional): the chain a dApp/widget expected the wallet to be on. If this differs from chainId, wrong-network is detected immediately from the two given values — no extra RPC calls needed. Omit this if you don't already know it; the tool still detects wrong-network on its own by searching a small set of chains when the tx isn't found where expected.

Returns a Diagnosis: { mode, confidence, evidence, ruleTriggered, healthy?, quantifiedSlippage?, bridgeDeepDive? }.

Use this when: a user reports "my transaction failed", "my swap didn't work", "my tokens haven't arrived", or pastes a transaction hash asking what went wrong.
Don't use this when: the user wants to broadcast, sign, or simulate a NEW transaction (this tool is read-only and diagnoses transactions that already happened), or wants price/market data unrelated to a specific transaction.

Error cases:
- Malformed txHash: rejected by input validation before any network call — respond with the required format (0x + 64 hex characters).
- Unsupported chainId: returns an error listing the chain IDs this deployment actually supports; try one of those, or note the chain isn't covered yet.
- Transaction not found on chainId: this is not necessarily an error — it's routed through wrong-network detection first (the tx may simply live on a different chain), and only reported as inconclusive if it isn't found anywhere checked.
- RPC timeout: reported distinctly from other failures with a note that retrying is reasonable, since it may be transient network congestion rather than a permanent failure.`;

export function registerDiagnoseTool(server: McpServer): void {
  server.registerTool(
    "diagnose_transaction",
    {
      title: "Diagnose Transaction",
      description: DESCRIPTION,
      inputSchema: DiagnoseInputSchema.shape,
      outputSchema: DiagnoseOutputSchema.shape,
      annotations: {
        title: "Diagnose Transaction",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ txHash, chainId, expectedChainId }) => {
      const result = await runDiagnosis({ txHash, chainId, expectedChainId });

      if (!result.ok) {
        return {
          content: [{ type: "text", text: result.error }],
          isError: true,
        };
      }

      const diagnosis = result.diagnosis;
      return {
        content: [
          {
            type: "text",
            text: `${diagnosis.mode} (confidence ${diagnosis.confidence}): ${JSON.stringify(diagnosis.evidence)}`,
          },
        ],
        structuredContent: diagnosis,
      };
    }
  );
}
