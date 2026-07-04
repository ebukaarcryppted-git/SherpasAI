/**
 * Buyer-side mirror of sherpas-support-mcp-server/src/payments/pricing.ts —
 * must agree exactly with the seller's unit price, or every voucher this
 * proxy signs settles for the wrong amount against the gated server's own
 * SESSION_ROUTE config.
 */
export const DIAGNOSIS_UNIT_PRICE_USD = 0.03;
export const TOKEN_DECIMALS = 6;
export const DIAGNOSIS_UNIT_PRICE_BASE_UNITS = BigInt(Math.round(DIAGNOSIS_UNIT_PRICE_USD * 10 ** TOKEN_DECIMALS)).toString();
