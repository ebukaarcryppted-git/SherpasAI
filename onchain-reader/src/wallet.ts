import { erc20Abi, formatUnits, type Hex } from "viem";
import { getClient } from "./client.js";

export interface TokenBalance {
  token: Hex;
  symbol: string;
  decimals: number;
  raw: bigint;
  formatted: string;
}

export interface WalletOverview {
  chainId: number;
  address: Hex;
  nativeBalance: bigint;
  nativeFormatted: string;
  txCount: number;
  tokens: TokenBalance[];
}

/**
 * Reads native balance + a caller-supplied list of ERC-20 balances for a
 * wallet. Token discovery (finding *which* tokens a wallet holds) needs an
 * indexer we don't have here — callers pass the token addresses they care
 * about (e.g. the ones surfaced by a support ticket).
 */
export async function getWalletOverview(
  chainId: number,
  address: Hex,
  tokens: Hex[] = []
): Promise<WalletOverview> {
  const client = getClient(chainId);

  const [nativeBalance, txCount, tokenBalances] = await Promise.all([
    client.getBalance({ address }),
    client.getTransactionCount({ address }),
    Promise.all(tokens.map((token) => getTokenBalance(chainId, token, address))),
  ]);

  return {
    chainId,
    address,
    nativeBalance,
    nativeFormatted: formatUnits(nativeBalance, 18),
    txCount,
    tokens: tokenBalances,
  };
}

export async function getTokenBalance(
  chainId: number,
  token: Hex,
  owner: Hex
): Promise<TokenBalance> {
  const client = getClient(chainId);

  const [raw, decimals, symbol] = await Promise.all([
    client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [owner],
    }),
    client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
    client.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }),
  ]);

  return { token, symbol, decimals, raw, formatted: formatUnits(raw, decimals) };
}
