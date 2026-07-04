import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";

/**
 * Buyer-side (payer) primitives for OKX onchainOS's MPP "session" model —
 * the actual pay-as-you-go mechanic. There's no bundled buyer SDK for this
 * in @okxweb3/mpp (only the seller/session() side ships in that package),
 * so these implement the wire format directly from OKX's own protocol spec
 * (github.com/okx/mpp-specs, draft-evm-session-00) and match byte-for-byte
 * the seller's own verifyVoucher() in @okxweb3/mpp/evm/server/voucher.ts —
 * confirmed by round-tripping a signed voucher through that exact function
 * in voucher.test.ts.
 */

export const DEFAULT_DOMAIN_NAME = "EVM Payment Channel";
export const DEFAULT_DOMAIN_VERSION = "1";

export interface ChannelIdParams {
  payer: Address;
  payee: Address;
  token: Address;
  salt: Hex;
  authorizedSigner: Address;
  escrowContract: Address;
  chainId: number;
}

/**
 * channelId = keccak256(abi.encode(payer, payee, token, salt, authorizedSigner,
 * escrowContract, chainId)) — binds the channel to a specific escrow
 * deployment and chain, per the spec.
 */
export function deriveChannelId(params: ChannelIdParams): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "address" },
        { type: "address" },
        { type: "address" },
        { type: "bytes32" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
      ],
      [
        params.payer,
        params.payee,
        params.token,
        params.salt,
        params.authorizedSigner,
        params.escrowContract,
        BigInt(params.chainId),
      ]
    )
  );
}

export interface OpenNonceParams {
  payee: Address;
  token: Address;
  salt: Hex;
  authorizedSigner: Address;
  splitRecipients: Address[];
  splitBps: number[];
}

/** EIP-3009 nonce for the channel-opening deposit authorization. */
export function deriveOpenNonce(params: OpenNonceParams): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "address" },
        { type: "address" },
        { type: "bytes32" },
        { type: "address" },
        { type: "address[]" },
        { type: "uint16[]" },
      ],
      [
        params.payee,
        params.token,
        params.salt,
        params.authorizedSigner,
        params.splitRecipients,
        params.splitBps.map((bps) => bps),
      ]
    )
  );
}

export interface TopUpNonceParams {
  channelId: Hex;
  additionalDeposit: bigint;
  from: Address;
  topUpSalt: Hex;
}

/** EIP-3009 nonce for a topUp deposit authorization. */
export function deriveTopUpNonce(params: TopUpNonceParams): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint256" }, { type: "address" }, { type: "bytes32" }],
      [params.channelId, params.additionalDeposit, params.from, params.topUpSalt]
    )
  );
}

export interface VoucherSigner {
  signTypedData: (args: {
    domain: { name: string; version: string; chainId: number; verifyingContract: Address };
    types: { Voucher: readonly { name: string; type: string }[] };
    primaryType: "Voucher";
    message: { channelId: Hex; cumulativeAmount: bigint };
  }) => Promise<Hex>;
}

export interface SignVoucherParams {
  signer: VoucherSigner;
  chainId: number;
  escrowContract: Address;
  channelId: Hex;
  cumulativeAmount: bigint;
  domainName?: string;
  domainVersion?: string;
}

/**
 * Signs a Voucher("cumulative spend so far is X") — the recurring, off-chain,
 * zero-gas action that's the actual "pay-as-you-go" mechanic. Domain and type
 * must match the seller's verifyVoucher() exactly or signatures won't verify.
 */
export async function signVoucher(params: SignVoucherParams): Promise<Hex> {
  return params.signer.signTypedData({
    domain: {
      name: params.domainName ?? DEFAULT_DOMAIN_NAME,
      version: params.domainVersion ?? DEFAULT_DOMAIN_VERSION,
      chainId: params.chainId,
      verifyingContract: params.escrowContract,
    },
    types: {
      Voucher: [
        { name: "channelId", type: "bytes32" },
        { name: "cumulativeAmount", type: "uint128" },
      ],
    },
    primaryType: "Voucher",
    message: {
      channelId: params.channelId,
      cumulativeAmount: params.cumulativeAmount,
    },
  });
}
