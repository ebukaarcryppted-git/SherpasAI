import type { Hash, Hex } from "viem";
import { X_LAYER_MAINNET_ID, X_LAYER_TESTNET_ID, ETHEREUM_MAINNET_ID } from "./chains.js";
import { findTransactionAcrossChains, lookupTransactionOnChain } from "./tx.js";
import { getAllowance } from "./allowance.js";
import { getGasContext } from "./gas.js";
import { getNonceContext } from "./nonce.js";
import { checkBridgeStatus } from "./bridge.js";
import { getWalletOverview, getTokenBalance } from "./wallet.js";
import { scanTokenApprovals, scanWalletApprovals } from "./approvals.js";

export * from "./types.js";
export * from "./chains.js";
export { getClient } from "./client.js";
export { lookupTransactionOnChain, findTransactionAcrossChains } from "./tx.js";
export { getAllowance } from "./allowance.js";
export { getGasContext } from "./gas.js";
export { getNonceContext } from "./nonce.js";
export { checkBridgeStatus } from "./bridge.js";
export { getWalletOverview, getTokenBalance } from "./wallet.js";
export { scanTokenApprovals, scanWalletApprovals } from "./approvals.js";
export type { ApprovalFinding } from "./approvals.js";
export type { WalletOverview, TokenBalance } from "./wallet.js";
export { getBlockNumberAtTimestamp, getBaseFeeAtTimestamp } from "./blockAtTime.js";
export { withRetry } from "./retry.js";

export interface DiagnoseInput {
  txHash: Hash;
  /** Chain the user expected this tx to be on; defaults to X Layer mainnet. */
  expectedChainId?: number;
  /** For allowance checks, if the tx failed on a token approval issue. */
  allowanceCheck?: { token: Hex; owner: Hex; spender: Hex };
}

export interface DiagnosisContext {
  tx: Awaited<ReturnType<typeof findTransactionAcrossChains>>;
  gas: Awaited<ReturnType<typeof getGasContext>> | null;
  nonce: Awaited<ReturnType<typeof getNonceContext>> | null;
  allowance: Awaited<ReturnType<typeof getAllowance>> | null;
}

/**
 * Single entry point for agent-core: gathers all the raw onchain signals
 * needed to classify a failed tx against the 6 supported failure modes.
 * agent-core's rule-based classifier decides which signals matter.
 */
export async function gatherDiagnosisContext(
  input: DiagnoseInput
): Promise<DiagnosisContext> {
  const expectedChainId = input.expectedChainId ?? X_LAYER_MAINNET_ID;

  const tx = await findTransactionAcrossChains(input.txHash, expectedChainId);
  const primary = tx.foundOn.find((r) => r.chainId === expectedChainId) ?? tx.foundOn[0];

  const [gas, nonce, allowance] = await Promise.all([
    primary
      ? getGasContext(primary.chainId, {
          gasPrice: primary.gasPrice,
          maxFeePerGas: primary.maxFeePerGas,
        })
      : null,
    primary?.from
      ? getNonceContext(primary.chainId, primary.from, primary.nonce)
      : null,
    input.allowanceCheck
      ? getAllowance(
          expectedChainId,
          input.allowanceCheck.token,
          input.allowanceCheck.owner,
          input.allowanceCheck.spender
        )
      : null,
  ]);

  return { tx, gas, nonce, allowance };
}

export { X_LAYER_MAINNET_ID, X_LAYER_TESTNET_ID, ETHEREUM_MAINNET_ID };
