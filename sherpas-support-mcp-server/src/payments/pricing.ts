/**
 * Pay-as-you-go pricing for diagnose_transaction, per the x402 "exact" scheme:
 * each call is a standalone, upfront on-chain payment (no channel, no
 * cumulative voucher) — the buyer pays the exact price and the resource is
 * served. Token is USD₮0 (6 decimals) on X Layer, the default stablecoin
 * OKX's x402 EVM implementation uses for chain eip155:196.
 *
 * Named constant (not inlined in the route config) so the price is
 * trivially adjustable — e.g. for a demo asking "what if you 10x'd it?"
 */
export const DIAGNOSIS_UNIT_PRICE_USD = 0.03;

/** USD₮0 has 6 decimals, matching every other EIP-3009-style stablecoin OKX's SDK targets. */
export const TOKEN_DECIMALS = 6;

export function usdToBaseUnits(usd: number): string {
  return BigInt(Math.round(usd * 10 ** TOKEN_DECIMALS)).toString();
}

export function baseUnitsToUsd(baseUnits: string | bigint): number {
  return Number(BigInt(baseUnits)) / 10 ** TOKEN_DECIMALS;
}
