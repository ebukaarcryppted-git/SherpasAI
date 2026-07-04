/**
 * Pay-as-you-go pricing for diagnose_transaction, per OKX onchainOS's MPP
 * "session" (channel + off-chain voucher) model: a buyer opens one escrow
 * channel, then each call just adds this unit price to a signed cumulative
 * voucher — no on-chain tx per call. Token is USD₮0 (6 decimals) on X Layer.
 *
 * Named constant (not inlined in the session config) so the price is
 * trivially adjustable — e.g. for a demo asking "what if you 10x'd it?"
 */
export const DIAGNOSIS_UNIT_PRICE_USD = 0.03;

/** USD₮0 has 6 decimals, matching every other EIP-3009-style stablecoin OKX's SDK targets. */
export const TOKEN_DECIMALS = 6;

export const DIAGNOSIS_UNIT_PRICE_BASE_UNITS = usdToBaseUnits(DIAGNOSIS_UNIT_PRICE_USD);

/**
 * Recommended pre-deposit when a channel opens: enough to cover ~100 calls
 * before a topUp is needed, per OKX's own "Typically unit price × 100" guidance.
 */
export const SUGGESTED_DEPOSIT_BASE_UNITS = multiplyBaseUnits(DIAGNOSIS_UNIT_PRICE_BASE_UNITS, 100n);

export function usdToBaseUnits(usd: number): string {
  return BigInt(Math.round(usd * 10 ** TOKEN_DECIMALS)).toString();
}

export function baseUnitsToUsd(baseUnits: string | bigint): number {
  return Number(BigInt(baseUnits)) / 10 ** TOKEN_DECIMALS;
}

function multiplyBaseUnits(baseUnits: string, factor: bigint): string {
  return (BigInt(baseUnits) * factor).toString();
}
