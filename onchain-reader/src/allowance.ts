import { erc20Abi, type Hex } from "viem";
import { getClient } from "./client.js";
import type { AllowanceContext } from "./types.js";

/** Reads an ERC-20 allowance to detect the "insufficient allowance" failure mode. */
export async function getAllowance(
  chainId: number,
  token: Hex,
  owner: Hex,
  spender: Hex
): Promise<AllowanceContext> {
  const client = getClient(chainId);

  const [allowance, decimals, symbol] = await Promise.all([
    client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "allowance",
      args: [owner, spender],
    }),
    client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
    client.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }),
  ]);

  return { chainId, token, owner, spender, allowance, decimals, symbol };
}
