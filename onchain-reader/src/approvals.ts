import { erc20Abi, maxUint256, parseAbiItem, type Hex } from "viem";
import { getClient } from "./client.js";
import { withRetry } from "./retry.js";

const APPROVAL_EVENT = parseAbiItem(
  "event Approval(address indexed owner, address indexed spender, uint256 value)"
);

/**
 * Public X Layer RPCs (confirmed live against rpc.xlayer.tech) cap
 * eth_getLogs to a 100-block range per call — far tighter than most
 * providers. We page through chunks of this size instead of one big range.
 */
const LOG_CHUNK_BLOCKS = BigInt(100);

/**
 * Total blocks scanned back from the tip, across all chunks. Bounded to
 * keep request count sane on a public RPC with no batch endpoint — this is
 * a real limitation, not a preference: discovering *older* approvals needs
 * an indexer (Approval events don't decay, but our lookback window does).
 * At X Layer's ~1s block time this is roughly the last ~13 minutes.
 */
const DEFAULT_LOOKBACK_BLOCKS = BigInt(800);

/**
 * How many chunk requests to run concurrently. Kept low — rpc.xlayer.tech's
 * rate limit is tighter in practice than its documented 100 req/s once
 * other calls (getBlockNumber, readContract) share the same window.
 */
const CONCURRENCY = 3;

export interface ApprovalFinding {
  chainId: number;
  token: Hex;
  tokenSymbol: string;
  spender: Hex;
  allowance: bigint;
  /** true if the approval is effectively unlimited (== max uint256, or absurdly large) */
  unlimited: boolean;
  risk: "unlimited" | "limited" | "none";
}

/**
 * Discovers spenders a wallet has recently approved for a given token (via
 * Approval event logs, so no hardcoded router/aggregator addresses are
 * needed) and reads each one's *current* allowance to report what's still
 * live today. This is the "why is my wallet draining" support-ticket flow:
 * surface forgotten or unlimited approvals a user can then revoke.
 *
 * Limited to a recent lookback window (see DEFAULT_LOOKBACK_BLOCKS) by the
 * public RPC's 100-block eth_getLogs cap — this finds approvals made
 * recently, not necessarily ever. Pass a larger `lookbackBlocks` if your
 * RPC allows it, or wire in an indexer for full history.
 */
export async function scanTokenApprovals(
  chainId: number,
  token: Hex,
  owner: Hex,
  lookbackBlocks: bigint = DEFAULT_LOOKBACK_BLOCKS
): Promise<ApprovalFinding[]> {
  const client = getClient(chainId);
  const latestBlock = await client.getBlockNumber();
  const fromBlock = latestBlock > lookbackBlocks ? latestBlock - lookbackBlocks : BigInt(0);

  const ranges: Array<{ from: bigint; to: bigint }> = [];
  for (let start = fromBlock; start <= latestBlock; start += LOG_CHUNK_BLOCKS) {
    const end = start + LOG_CHUNK_BLOCKS - BigInt(1) > latestBlock
      ? latestBlock
      : start + LOG_CHUNK_BLOCKS - BigInt(1);
    ranges.push({ from: start, to: end });
  }

  const allLogs = [];
  for (let i = 0; i < ranges.length; i += CONCURRENCY) {
    const batch = ranges.slice(i, i + CONCURRENCY);
    const batchLogs = await Promise.all(
      batch.map(({ from, to }) =>
        withRetry(() =>
          client.getLogs({
            address: token,
            event: APPROVAL_EVENT,
            args: { owner },
            fromBlock: from,
            toBlock: to,
          })
        )
      )
    );
    allLogs.push(...batchLogs.flat());
  }

  const spenders = [...new Set(allLogs.map((log) => log.args.spender).filter(Boolean))] as Hex[];
  if (spenders.length === 0) return [];

  const symbol = await client.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "symbol",
  });

  const findings = await Promise.all(
    spenders.map(async (spender): Promise<ApprovalFinding | null> => {
      const allowance = await client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [owner, spender],
      });

      if (allowance === BigInt(0)) return null; // revoked or never active

      // Treat anything within 1e18 of max uint256 as "unlimited" — some
      // routers approve slightly-off-max sentinel values.
      const unlimited = maxUint256 - allowance < BigInt(10) ** BigInt(18);

      return {
        chainId,
        token,
        tokenSymbol: symbol,
        spender,
        allowance,
        unlimited,
        risk: unlimited ? "unlimited" : "limited",
      };
    })
  );

  return findings.filter((f): f is ApprovalFinding => f !== null);
}

/** Runs scanTokenApprovals across a list of tokens and flattens the results. */
export async function scanWalletApprovals(
  chainId: number,
  owner: Hex,
  tokens: Hex[],
  lookbackBlocks?: bigint
): Promise<ApprovalFinding[]> {
  const results = await Promise.all(
    tokens.map((token) => scanTokenApprovals(chainId, token, owner, lookbackBlocks))
  );
  return results.flat();
}
