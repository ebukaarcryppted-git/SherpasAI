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

interface TxFillsResult {
  outputDetails?: Array<{ outputHash: string; isContract: boolean }>;
  state?: string;
}

async function getTransactionFills(txid: string): Promise<TxFillsResult> {
  const path = `/api/v5/xlayer/transaction/transaction-fills?chainShortName=xlayer&txid=${txid}`;
  const json = await okxGet(path);
  return json.data[0] as TxFillsResult;
}

async function getTransactionList(address: string, limit = 50): Promise<Array<Record<string, unknown>>> {
  const path = `/api/v5/xlayer/address/transaction-list?chainShortName=xlayer&address=${address}&limit=${limit}`;
  const json = await okxGet(path);
  return (json.data[0] as { transactionLists: Array<Record<string, unknown>> }).transactionLists;
}

// Known real L1->L2 bridge deposit L2-side tx hashes, pulled from
// oklink.com/x-layer/tx-list/l1tol2 (all sharing L1 sender
// 0x2e96ee80e5f5cc659595245b3067c1afff8287e6, which turned out to be a
// router/aggregator address, not necessarily the X Layer recipient —
// hence resolving the real recipient from the tx detail below).
const KNOWN_L2_DEPOSIT_TX_HASHES = [
  "0xb6fd85c8441a0b457271bfef958e8c91a86e7c9e7cfa91650b3a03dbd29fdcc5",
  "0x5f4a4e1a9f7c19c63d32b50b47534a45873c276d0e4a2231c908de2cdefb831b",
  "0xd689438146177536d0670be3842bc3bf24dfbc295b41e44219e620e8c205c35d",
];

export function isDebugBridgeFieldsRequest(req: IncomingMessage): boolean {
  return (req.url ?? "").startsWith(DEBUG_PATH);
}

export async function handleDebugBridgeFieldsRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const results: Record<string, unknown> = {};

  for (const l2TxHash of KNOWN_L2_DEPOSIT_TX_HASHES) {
    try {
      const fills = await getTransactionFills(l2TxHash);
      const recipient = fills.outputDetails?.[0]?.outputHash;
      if (!recipient) {
        results[l2TxHash] = { error: "no outputDetails/outputHash found on this tx", fills };
        continue;
      }

      const txs = await getTransactionList(recipient, 50);
      const matchingTx = txs.find((t) => (t as { txId?: string }).txId?.toLowerCase() === l2TxHash.toLowerCase());

      results[l2TxHash] = {
        resolvedRecipient: recipient,
        recipientTxCount: txs.length,
        matchingTxFound: !!matchingTx,
        matchingTxEntry: matchingTx ?? null,
        // Also report across ALL of this recipient's transactions, not just the matching one,
        // in case the fields populate on other entries but not this exact one.
        anyChallengeStatusInList: txs.filter((t) => (t as { challengeStatus?: string }).challengeStatus).length,
        anyL1OriginHashInList: txs.filter((t) => (t as { l1OriginHash?: string }).l1OriginHash).length,
      };
    } catch (err) {
      results[l2TxHash] = { error: err instanceof Error ? err.message : String(err) };
    }
  }

  res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(results, null, 2));
}
