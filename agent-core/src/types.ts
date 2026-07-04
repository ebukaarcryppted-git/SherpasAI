export type FailureMode =
  | "slippage"
  | "allowance"
  | "wrong_network"
  | "bridge_stuck"
  | "gas_too_low"
  | "nonce_gap"
  | "reverted_other"
  | "healthy"
  | "not_found"
  | "pending";

export interface Diagnosis {
  hash: string;
  mode: FailureMode;
  chainLabel: string | null;
  headline: string;
  fix: string;
  details: Record<string, string>;
}
