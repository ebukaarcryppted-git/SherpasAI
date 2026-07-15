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

async function getTransactionList(address: string, limit = 50): Promise<unknown[]> {
  const path = `/api/v5/xlayer/address/transaction-list?chainShortName=xlayer&address=${address}&limit=${limit}`;
  const headers = buildHeaders("GET", path);
  const res = await fetch(BASE_URL + path, { headers });
  const json = (await res.json()) as { code: string; msg: string; data: Array<{ transactionLists: unknown[] }> };
  if (json.code !== "0") {
    throw new Error(`OKX API error ${json.code}: ${json.msg}`);
  }
  return json.data[0].transactionLists;
}

const CANDIDATE_ADDRESSES = [
  "0x2a3dd3eb832af982ec71669e178424b10dca2ede",
  "0x611f7bf868a6212f871e89f7e44684045ddfb09d",
  "0xa1d2c4533d867ce4623681f68df84d9cad73cb6b",
];

export function isDebugBridgeFieldsRequest(req: IncomingMessage): boolean {
  return (req.url ?? "").startsWith(DEBUG_PATH);
}

export async function handleDebugBridgeFieldsRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const results: Record<string, unknown> = {};
  for (const address of CANDIDATE_ADDRESSES) {
    try {
      const txs = await getTransactionList(address, 50);
      const withChallenge = txs.filter((t) => (t as { challengeStatus?: string }).challengeStatus);
      const withL1Origin = txs.filter((t) => (t as { l1OriginHash?: string }).l1OriginHash);
      results[address] = {
        fetched: txs.length,
        challengeStatusPopulatedCount: withChallenge.length,
        l1OriginHashPopulatedCount: withL1Origin.length,
        sampleWithChallenge: withChallenge[0] ?? null,
        sampleWithL1Origin: withL1Origin[0] ?? null,
      };
    } catch (err) {
      results[address] = { error: err instanceof Error ? err.message : String(err) };
    }
  }
  res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(results, null, 2));
}
