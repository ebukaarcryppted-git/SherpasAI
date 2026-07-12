import { Challenge, Credential } from "@okxweb3/mpp";
import { privateKeyToAccount } from "viem/accounts";
import { zeroAddress, type Address, type Hex } from "viem";
import { deriveChannelId, deriveOpenNonce, signVoucher } from "./voucher";
import { signEip3009Authorization } from "./eip3009";
import { loadChannelState, newChannelState, randomSalt, saveChannelState, type ChannelState } from "./channelStore";
import { DIAGNOSIS_UNIT_PRICE_BASE_UNITS } from "./pricing";

/**
 * The widget's backend proxy's payer identity: the embedding protocol's own
 * funded wallet, held server-side only. Never touches the browser — see
 * app/api/diagnose-proxy/route.ts, the only caller of this module.
 */
function getPayerAccount() {
  const pk = process.env.DIAGNOSIS_PAYER_PRIVATE_KEY;
  if (!pk) throw new Error("Missing DIAGNOSIS_PAYER_PRIVATE_KEY — the proxy has no funded wallet to pay with.");
  return privateKeyToAccount(pk as Hex);
}

const X_LAYER_CHAIN_ID = 196;
const DEFAULT_ESCROW_CONTRACT: Address = "0x5E550002e64FaF79B41D89fE8439eEb1be66CE3b";

function config() {
  return {
    escrowContract: (process.env.MPP_ESCROW as Address | undefined) ?? DEFAULT_ESCROW_CONTRACT,
    currency: requireEnv("MPP_CURRENCY") as Address,
    recipient: requireEnv("MPP_RECIPIENT") as Address,
    tokenName: process.env.MPP_TOKEN_NAME ?? "USD Coin", // MUST match the real deployed USD₮0 domain — see eip3009.ts
    tokenVersion: process.env.MPP_TOKEN_VERSION ?? "2",
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name} for the diagnose-proxy payer.`);
  return value;
}

/** POSTs to the gated MCP endpoint with an optional Payment credential header. */
async function postToMcp(mcpServerUrl: string, body: unknown, credentialHeader?: string): Promise<Response> {
  return fetch(mcpServerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(credentialHeader ? { Authorization: credentialHeader } : {}),
    },
    body: JSON.stringify(body),
  });
}

/**
 * Ensures a channel is open against the gated MCP server, opening one (a
 * single on-chain deposit) if this is the first call. Subsequent calls reuse
 * the persisted channel and never touch this path again.
 */
async function ensureChannelOpen(mcpServerUrl: string): Promise<ChannelState> {
  const existing = await loadChannelState();
  if (existing?.opened) return existing;

  const payer = getPayerAccount();
  const { escrowContract, currency, recipient, tokenName, tokenVersion } = config();
  const salt = existing?.salt ?? randomSalt();

  // authorizedSigner is for delegating channel management to a third party
  // distinct from the payer — when the payer signs for themselves (this
  // proxy's case), the protocol requires the zero address here, not the
  // payer's own address, or the seller's verification rejects it with
  // "authorizedSigner must not equal the payer".
  const channelId = deriveChannelId({
    payer: payer.address,
    payee: recipient,
    token: currency,
    salt,
    authorizedSigner: zeroAddress,
    escrowContract,
    chainId: X_LAYER_CHAIN_ID,
  });

  // First request with no credential — the gate replies 402 with a challenge
  // that echoes this route's own pricing config. We don't need its fields
  // (we already know our own price/config), just the Challenge object itself
  // to echo back in the credential per the protocol's HMAC-binding scheme.
  const probe = await postToMcp(mcpServerUrl, { jsonrpc: "2.0", id: 0, method: "ping" });
  if (probe.status !== 402) {
    throw new Error(`Expected a 402 payment challenge from the MCP server, got ${probe.status}.`);
  }
  const challenge = Challenge.fromResponse(probe);

  const depositAmount = BigInt(existing?.cumulativeAmount ?? "0") + BigInt(DIAGNOSIS_UNIT_PRICE_BASE_UNITS) * BigInt(100);
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const nonce = deriveOpenNonce({
    from: payer.address,
    payee: recipient,
    token: currency,
    salt,
    authorizedSigner: zeroAddress,
  });

  const authorizationSignature = await signEip3009Authorization({
    signer: payer,
    chainId: X_LAYER_CHAIN_ID,
    tokenAddress: currency,
    tokenName,
    tokenVersion,
    from: payer.address,
    to: escrowContract,
    value: depositAmount,
    validAfter: BigInt(0),
    validBefore,
    nonce,
  });

  const credential = Credential.from({
    challenge,
    payload: {
      action: "open",
      type: "transaction",
      channelId,
      salt,
      cumulativeAmount: "0",
      authorization: {
        type: "eip-3009",
        from: payer.address,
        to: escrowContract,
        value: depositAmount.toString(),
        validAfter: "0",
        validBefore: validBefore.toString(),
        nonce,
      },
      signature: authorizationSignature,
      authorizedSigner: zeroAddress,
    },
    source: `did:pkh:eip155:${X_LAYER_CHAIN_ID}:${payer.address}`,
  });

  const openResponse = await postToMcp(mcpServerUrl, { jsonrpc: "2.0", id: 0, method: "ping" }, Credential.serialize(credential));
  if (!openResponse.ok) {
    throw new Error(`Channel open was rejected: ${openResponse.status} ${await openResponse.text()}`);
  }

  const state = newChannelState(channelId, salt);
  state.opened = true;
  await saveChannelState(state);
  return state;
}

export interface DiagnoseProxyResult {
  status: number;
  body: unknown;
}

/**
 * The actual pay-as-you-go mechanic: ensures a channel is open, signs the
 * next cumulative voucher (off-chain, zero gas), and forwards the real
 * diagnose_transaction call with it attached.
 */
export async function payAndDiagnose(mcpServerUrl: string, mcpRequestBody: unknown): Promise<DiagnoseProxyResult> {
  const payer = getPayerAccount();
  const { escrowContract } = config();
  const state = await ensureChannelOpen(mcpServerUrl);

  const nextCumulative = BigInt(state.cumulativeAmount) + BigInt(DIAGNOSIS_UNIT_PRICE_BASE_UNITS);
  const signature = await signVoucher({
    signer: payer,
    chainId: X_LAYER_CHAIN_ID,
    escrowContract,
    channelId: state.channelId,
    cumulativeAmount: nextCumulative,
  });

  const probe = await postToMcp(mcpServerUrl, mcpRequestBody);
  if (probe.status !== 402) {
    // Server isn't actually payment-gated (e.g. local dev without OKX env vars) — pass through.
    return { status: probe.status, body: await probe.json().catch(() => null) };
  }
  const challenge = Challenge.fromResponse(probe);

  const credential = Credential.from({
    challenge,
    payload: {
      action: "voucher",
      channelId: state.channelId,
      cumulativeAmount: nextCumulative.toString(),
      signature,
    },
    source: `did:pkh:eip155:${X_LAYER_CHAIN_ID}:${payer.address}`,
  });

  const paidResponse = await postToMcp(mcpServerUrl, mcpRequestBody, Credential.serialize(credential));
  const responseBody = await paidResponse.json().catch(() => null);

  if (paidResponse.ok) {
    state.cumulativeAmount = nextCumulative.toString();
    await saveChannelState(state);
  }

  return { status: paidResponse.status, body: responseBody };
}
