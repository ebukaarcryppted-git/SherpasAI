import type { Hex } from "viem";
import { scanWalletApprovals, type ApprovalFinding } from "@support-agent-asp/onchain-reader";

export interface ApprovalReport {
  chainId: number;
  owner: Hex;
  findings: ApprovalFinding[];
  riskyCount: number;
  summary: string;
  recommendations: string[];
}

/**
 * The "why is my wallet draining" flow: scans a wallet's approvals across
 * the tokens the caller supplies and flags unlimited/forgotten ones with a
 * concrete revoke recommendation per spender.
 */
export async function diagnoseApprovals(
  chainId: number,
  owner: Hex,
  tokens: Hex[]
): Promise<ApprovalReport> {
  const findings = await scanWalletApprovals(chainId, owner, tokens);
  const risky = findings.filter((f) => f.risk === "unlimited");

  const summary =
    findings.length === 0
      ? "No active approvals found across the tokens checked."
      : risky.length > 0
        ? `${findings.length} active approval(s) found, ${risky.length} of them unlimited.`
        : `${findings.length} active approval(s) found, all capped (none unlimited).`;

  const recommendations = risky.map(
    (f) =>
      `Revoke ${f.tokenSymbol}'s unlimited approval to ${f.spender} unless you recognize and still use that contract regularly.`
  );

  return {
    chainId,
    owner,
    findings,
    riskyCount: risky.length,
    summary,
    recommendations,
  };
}
