import { BaseError, ContractFunctionRevertedError, type Hash, type Hex } from "viem";
import { getClient, allSupportedChainIds } from "./client.js";
import type { CrossChainTxLookup, TransactionLookup } from "./types.js";

/** Looks up a single tx on a single chain. Never throws; returns not_found on any failure. */
export async function lookupTransactionOnChain(
  chainId: number,
  hash: Hash
): Promise<TransactionLookup> {
  const client = getClient(chainId);

  try {
    const tx = await client.getTransaction({ hash });

    let receipt;
    try {
      receipt = await client.getTransactionReceipt({ hash });
    } catch {
      // tx exists but hasn't been mined yet
      return {
        found: true,
        chainId,
        hash,
        status: "pending",
        from: tx.from,
        to: tx.to,
        input: tx.input,
        nonce: tx.nonce,
        gasPrice: tx.gasPrice,
        maxFeePerGas: tx.maxFeePerGas,
        maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
      };
    }

    const status = receipt.status === "success" ? "success" : "reverted";
    let revertReason: string | undefined;
    let rawRevertData: Hex | undefined;
    if (status === "reverted") {
      const decoded = await getRevertData(chainId, tx, receipt.blockNumber);
      revertReason = decoded.reason;
      rawRevertData = decoded.raw;
    }

    return {
      found: true,
      chainId,
      hash,
      status,
      revertReason,
      rawRevertData,
      from: tx.from,
      to: tx.to,
      input: tx.input,
      nonce: tx.nonce,
      gasPrice: tx.gasPrice,
      maxFeePerGas: tx.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
      gasUsed: receipt.gasUsed,
      blockNumber: receipt.blockNumber,
      receipt,
    };
  } catch {
    return { found: false, chainId, hash, status: "not_found" };
  }
}

/**
 * Replays a reverted transaction at its mined block to recover both a
 * human-readable reason (when viem can decode one) and the raw revert
 * bytes (always, when the RPC error carries them) — confirmed live against
 * X Layer: many real reverts are custom errors from unverified contracts
 * (e.g. a bare 4-byte selector like `0x4e47f8ea`) that viem's
 * ContractFunctionRevertedError walk never matches, since it only resolves
 * against a known ABI. In that case we still want the raw selector —
 * that's exactly the case classify.ts's slippage/allowance selector tables
 * are meant to catch when a human-readable reason isn't available.
 */
async function getRevertData(
  chainId: number,
  tx: { from: `0x${string}`; to: `0x${string}` | null; input: `0x${string}`; value: bigint },
  blockNumber: bigint
): Promise<{ reason?: string; raw?: Hex }> {
  const client = getClient(chainId);
  try {
    await client.call({
      account: tx.from,
      to: tx.to ?? undefined,
      data: tx.input,
      value: tx.value,
      blockNumber,
    });
    return {}; // replay succeeded; revert data unavailable (state-dependent)
  } catch (err) {
    const raw = extractRawRevertData(err);

    if (err instanceof BaseError) {
      const revertError = err.walk((e) => e instanceof ContractFunctionRevertedError);
      if (revertError instanceof ContractFunctionRevertedError) {
        const reason =
          revertError.data?.errorName ?? revertError.reason ?? revertError.shortMessage;
        return { reason, raw };
      }
      return { reason: err.shortMessage, raw };
    }
    return { reason: err instanceof Error ? err.message : String(err), raw };
  }
}

/**
 * Walks an error's `cause` chain looking for the raw hex `data` field the
 * underlying JSON-RPC error response carries — this is where the actual
 * revert bytes live even when viem can't decode them into a named error
 * (confirmed live: for a real custom-error revert, this sits several
 * `cause` levels deep, past CallExecutionError → ExecutionRevertedError →
 * RpcRequestError → a plain `{code, message, data}` object).
 */
function extractRawRevertData(err: unknown): Hex | undefined {
  let current: unknown = err;
  let depth = 0;
  while (current && depth < 10) {
    const data = (current as { data?: unknown }).data;
    if (typeof data === "string" && data.startsWith("0x")) return data as Hex;
    current = (current as { cause?: unknown }).cause;
    depth++;
  }
  return undefined;
}

/**
 * Scans every supported chain for a tx hash. Used to detect the
 * "wrong network" failure mode: a hash the user expected on X Layer that
 * actually only exists (or is missing) elsewhere.
 */
export async function findTransactionAcrossChains(
  hash: Hash,
  expectedChainId?: number
): Promise<CrossChainTxLookup> {
  const results: TransactionLookup[] = [];

  // Check the expected chain first and alone — it's the common case, and
  // finding it there means we're done without ever touching the others.
  if (expectedChainId !== undefined) {
    const expected = await lookupTransactionOnChain(expectedChainId, hash);
    if (expected.found) {
      return { hash, expectedChainId, foundOn: [expected], wrongNetworkSuspected: false };
    }
  }

  // Not found on the expected chain (or no expectation given) — check the
  // rest in parallel rather than one at a time. Sequential checking means
  // a single slow/rate-limited chain adds its full latency on top of every
  // other chain's; confirmed live this can compound into 40s+ per chain on
  // a degraded RPC, which is untenable when the caller is waiting for a
  // "not found anywhere" answer across 2-3 chains.
  const remainingChainIds = allSupportedChainIds().filter((id) => id !== expectedChainId);
  const remaining = await Promise.all(
    remainingChainIds.map((chainId) => lookupTransactionOnChain(chainId, hash))
  );
  results.push(...remaining.filter((r) => r.found));

  // Reaching this point already means "not found on the expected chain"
  // (or no expectation was given) — so wrongNetworkSuspected just needs to
  // know whether we found it anywhere else at all.
  return {
    hash,
    expectedChainId,
    foundOn: results,
    wrongNetworkSuspected: expectedChainId !== undefined && results.length > 0,
  };
}
