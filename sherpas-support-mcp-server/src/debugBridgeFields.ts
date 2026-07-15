// TEMPORARY diagnostic route — remove after checking whether OKX's X Layer
// onchaindata API populates challengeStatus/l1OriginHash on real
// transactions. See conversation: investigating a better bridge-status
// signal than the current destination-nonce heuristic in onchain-reader/src/bridge.ts.
import crypto from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

const BASE_URL = "https://web3.okx.com";
const DEBUG_PATH = "/debug/bridge-fields-check-9f3a";

function buildHeaders(method: string, path: string, body = ""): Record<string, string> {
  const timestamp = new Date().toISOString();
  const prehash = timestamp + method + path + body;
  const apiKey = process.env.OKX_API_KEY;
  const secretKey = process.env.OKX_SECRET_KEY;
  const passphrase = process.env.OKX_PASSPHRASE;
  if (!apiKey || !secretKey || !passphrase) {
    throw new Error("Missing OKX_API_KEY/OKX_SECRET_KEY/OKX_PASSPHRASE");
  }
  const sign = crypto.createHmac("sha256", secretKey).update(prehash).digest("base64");
  return {
    "OK-ACCESS-KEY": apiKey,
    "OK-ACCESS-SIGN": sign,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": passphrase,
  };
}

async function okxGet(path: string): Promise<{ code: string; msg: string; data: unknown[] }> {
  const headers = buildHeaders("GET", path);
  const res = await fetch(BASE_URL + path, { headers });
  const json = (await res.json()) as { code: string; msg: string; data: unknown[] };
  if (json.code !== "0") {
    throw new Error(`OKX API error ${json.code}: ${json.msg}`);
  }
  return json;
}

async function getTransactionList(address: string, limit = 50): Promise<Array<Record<string, unknown>>> {
  const path = `/api/v5/xlayer/address/transaction-list?chainShortName=xlayer&address=${address}&limit=${limit}`;
  const json = await okxGet(path);
  return (json.data[0] as { transactionLists: Array<Record<string, unknown>> }).transactionLists;
}

// Real L2->L1 withdrawal transactions pulled from oklink.com/x-layer/tx-list/l2tol1,
// including two still "Pending claim" (i.e. inside the fraud-proof challenge
// window) and one completed one. challengeStatus is a withdrawal-specific
// concept (deposits have no challenge period at all — see
// docs/xlayer-onchainos.md security model), so this is the correct test
// case, unlike the earlier deposit-based test round.
const KNOWN_WITHDRAWALS = [
  { label: "pending-1", sender: "0x3ecc1d702bc7e379fc7e70cba05162c501506ec7", l2TxHash: "0x3cbc1429bac2304f2a7f26d830e4179513ef3d14b8e7c06bfde7f2c6334e251a" },
  { label: "completed", sender: "0x33fc2046b56497c4644c23bf26ce06a913e70429", l2TxHash: "0x27e16c77f0329b4044ef65aede65503308fb05ba514bcb470d48bdb06dc52469" },
  { label: "pending-2", sender: "0x3707efbed8be2b8b7d7a58412eef27bef2c639e9", l2TxHash: "0xe1251de1adc9c19659d4185263a21bd79796c04e484ae84f0df824beed489654" },
];

export function isDebugBridgeFieldsRequest(req: IncomingMessage): boolean {
  return (req.url ?? "").startsWith(DEBUG_PATH);
}

export async function handleDebugBridgeFieldsRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const results: Record<string, unknown> = {};

  for (const { label, sender, l2TxHash } of KNOWN_WITHDRAWALS) {
    try {
      const txs = await getTransactionList(sender, 50);
      const matchingTx = txs.find((t) => (t as { txId?: string }).txId?.toLowerCase() === l2TxHash.toLowerCase());

      results[label] = {
        sender,
        l2TxHash,
        senderTxCount: txs.length,
        matchingTxFound: !!matchingTx,
        matchingTxEntry: matchingTx ?? null,
        anyChallengeStatusInList: txs.filter((t) => (t as { challengeStatus?: string }).challengeStatus).length,
        anyL1OriginHashInList: txs.filter((t) => (t as { l1OriginHash?: string }).l1OriginHash).length,
      };
    } catch (err) {
      results[label] = { sender, l2TxHash, error: err instanceof Error ? err.message : String(err) };
    }
  }

  res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(results, null, 2));
}
