import { describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { verifyVoucher } from "@okxweb3/mpp/evm";
import { deriveChannelId, signVoucher } from "./voucher";

/**
 * The most valuable test available without live OKX credentials: proving our
 * hand-rolled buyer-side voucher signer is genuinely wire-compatible with
 * OKX's own seller-side verifier, not just "looks plausible". If this ever
 * regresses, diagnose_transaction's real gate would silently reject every
 * voucher this proxy sends.
 */
describe("buyer voucher signing interop with OKX's seller verifyVoucher()", () => {
  it("produces a signature the real seller SDK accepts", async () => {
    const payerAccount = privateKeyToAccount(generatePrivateKey());
    const payeeAddress = privateKeyToAccount(generatePrivateKey()).address;
    const tokenAddress = privateKeyToAccount(generatePrivateKey()).address;
    const escrowContract = privateKeyToAccount(generatePrivateKey()).address;
    const salt = generatePrivateKey(); // any random bytes32 works as a salt

    const channelId = deriveChannelId({
      payer: payerAccount.address,
      payee: payeeAddress,
      token: tokenAddress,
      salt,
      authorizedSigner: payerAccount.address,
      escrowContract,
      chainId: 196,
    });

    const signature = await signVoucher({
      signer: payerAccount,
      chainId: 196,
      escrowContract,
      channelId,
      cumulativeAmount: BigInt(30_000),
    });

    const ok = await verifyVoucher({
      chainId: 196,
      escrowContract,
      channelId,
      cumulativeAmount: BigInt(30_000),
      signature,
      expectedSigner: payerAccount.address,
    });

    expect(ok).toBe(true);
  });

  it("rejects a voucher signed by the wrong key", async () => {
    const payerAccount = privateKeyToAccount(generatePrivateKey());
    const wrongAccount = privateKeyToAccount(generatePrivateKey());
    const escrowContract = privateKeyToAccount(generatePrivateKey()).address;
    const channelId = deriveChannelId({
      payer: payerAccount.address,
      payee: wrongAccount.address,
      token: escrowContract,
      salt: generatePrivateKey(),
      authorizedSigner: payerAccount.address,
      escrowContract,
      chainId: 196,
    });

    const signature = await signVoucher({
      signer: payerAccount,
      chainId: 196,
      escrowContract,
      channelId,
      cumulativeAmount: BigInt(30_000),
    });

    const ok = await verifyVoucher({
      chainId: 196,
      escrowContract,
      channelId,
      cumulativeAmount: BigInt(30_000),
      signature,
      expectedSigner: wrongAccount.address, // signed by payerAccount, not this one
    });

    expect(ok).toBe(false);
  });

  it("rejects a voucher for a tampered cumulativeAmount", async () => {
    const payerAccount = privateKeyToAccount(generatePrivateKey());
    const escrowContract = privateKeyToAccount(generatePrivateKey()).address;
    const channelId = deriveChannelId({
      payer: payerAccount.address,
      payee: escrowContract,
      token: escrowContract,
      salt: generatePrivateKey(),
      authorizedSigner: payerAccount.address,
      escrowContract,
      chainId: 196,
    });

    const signature = await signVoucher({
      signer: payerAccount,
      chainId: 196,
      escrowContract,
      channelId,
      cumulativeAmount: BigInt(30_000),
    });

    const ok = await verifyVoucher({
      chainId: 196,
      escrowContract,
      channelId,
      cumulativeAmount: BigInt(60_000), // tampered — signature was for BigInt(30_000)
      signature,
      expectedSigner: payerAccount.address,
    });

    expect(ok).toBe(false);
  });
});
