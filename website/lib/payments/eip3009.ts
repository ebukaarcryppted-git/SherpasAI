import type { Address, Hex } from "viem";

/**
 * EIP-3009 `transferWithAuthorization` signing — needed only for the
 * one-time channel `open` (and occasional `topUp`), where the buyer
 * authorizes the actual USD₮0 deposit into the escrow contract.
 *
 * Unlike the Voucher signature (domain confirmed as "EVM Payment Channel" by
 * OKX's own seller source), EIP-3009's domain is the TOKEN contract's own
 * EIP-712 domain — which varies by deployment. MPP_TOKEN_NAME/VERSION must
 * be set to match the real deployed USD₮0 contract on X Layer before `open`
 * will actually succeed against OKX's live facilitator; the recurring
 * `voucher` signing (the actual per-call pay-as-you-go mechanic) does not
 * depend on this at all.
 */
export interface Eip3009Signer {
  signTypedData: (args: {
    domain: { name: string; version: string; chainId: number; verifyingContract: Address };
    types: {
      TransferWithAuthorization: readonly { name: string; type: string }[];
    };
    primaryType: "TransferWithAuthorization";
    message: {
      from: Address;
      to: Address;
      value: bigint;
      validAfter: bigint;
      validBefore: bigint;
      nonce: Hex;
    };
  }) => Promise<Hex>;
}

export interface SignEip3009Params {
  signer: Eip3009Signer;
  chainId: number;
  tokenAddress: Address;
  tokenName: string;
  tokenVersion: string;
  from: Address;
  to: Address;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: Hex;
}

export async function signEip3009Authorization(params: SignEip3009Params): Promise<Hex> {
  return params.signer.signTypedData({
    domain: {
      name: params.tokenName,
      version: params.tokenVersion,
      chainId: params.chainId,
      verifyingContract: params.tokenAddress,
    },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message: {
      from: params.from,
      to: params.to,
      value: params.value,
      validAfter: params.validAfter,
      validBefore: params.validBefore,
      nonce: params.nonce,
    },
  });
}
