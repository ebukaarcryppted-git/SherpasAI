import { safeErrorMessage } from "@support-agent-asp/agent-core";
import { live, isSupportedChain, listSupportedChains } from "./onchain-reader.js";

const TIMEOUT_PATTERNS = [/timeout/i, /timed out/i, /econnreset/i, /fetch failed/i, /socket hang up/i];

function isTimeoutLike(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return TIMEOUT_PATTERNS.some((pattern) => pattern.test(message));
}

/** Deep-converts bigints to strings so the result is valid JSON. */
function toJsonSafe(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v)));
}

export interface RunDiagnosisParams {
  txHash: string;
  chainId: number;
  expectedChainId?: number;
}

export type RunDiagnosisResult =
  | { ok: true; diagnosis: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * The one place diagnose_transaction's actual work happens — shared by the
 * MCP tool handler (tools/diagnose.ts) and the plain-HTTP A2MCP path
 * (index.ts), so both surfaces run the exact same logic and can never
 * silently diverge.
 */
export async function runDiagnosis(params: RunDiagnosisParams): Promise<RunDiagnosisResult> {
  if (!/^0x[a-fA-F0-9]{64}$/.test(params.txHash)) {
    return { ok: false, error: "'txHash' must be a 66-character 0x-prefixed hex string." };
  }
  if (!isSupportedChain(params.chainId)) {
    return {
      ok: false,
      error: `Chain ID ${params.chainId} isn't supported by this server. Supported chains: ${listSupportedChains()}.`,
    };
  }

  try {
    const diagnosis = await live.diagnoseLive({
      txHash: params.txHash as `0x${string}`,
      expectedChainId: params.chainId,
      dappExpectedChainId: params.expectedChainId,
    });
    return { ok: true, diagnosis: toJsonSafe(diagnosis) };
  } catch (err) {
    if (isTimeoutLike(err)) {
      return {
        ok: false,
        error: "The chain read timed out. This is likely transient network congestion on a public RPC, not a permanent failure — retrying the same request is reasonable.",
      };
    }
    return {
      ok: false,
      error: safeErrorMessage(err, "Diagnosis failed — an unexpected error occurred reading chain data.", "diagnose_transaction failed:"),
    };
  }
}
