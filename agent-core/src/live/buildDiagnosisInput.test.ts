import { describe, expect, it } from "vitest";
import { buildDiagnosisInput } from "./buildDiagnosisInput.js";
import { diagnose } from "../classify.js";
import type { LiveReaders } from "./readers.js";
import type {
  CrossChainTxLookup,
  NonceContext,
  GasContext,
  AllowanceContext,
  TransactionLookup,
} from "@support-agent-asp/onchain-reader";

const X_LAYER = 196;
const ETH = 1;

function mockReaders(overrides: Partial<LiveReaders> = {}): LiveReaders {
  return {
    findTransactionAcrossChains: async () => ({
      hash: "0x000000000000000000000000000000000000000000000000000000000000cafe",
      foundOn: [],
      wrongNetworkSuspected: false,
    }) as CrossChainTxLookup,
    lookupTransactionOnChain: async () =>
      ({ found: false, chainId: X_LAYER, hash: "0x000000000000000000000000000000000000000000000000000000000000cafe", status: "not_found" }) as TransactionLookup,
    getNonceContext: async () =>
      ({ chainId: X_LAYER, address: "0xaddr", latestNonce: 5, pendingNonce: 5, hasGap: false, hasPendingBacklog: false }) as NonceContext,
    getGasContext: async () =>
      ({ chainId: X_LAYER, currentBaseFeePerGas: BigInt(1_000_000_000), currentGasPrice: BigInt(1_000_000_000), underpriced: false }) as GasContext,
    getAllowance: async () =>
      ({ chainId: X_LAYER, token: "0xtoken", owner: "0xowner", spender: "0xspender", allowance: BigInt(0), decimals: 18, symbol: "TKN" }) as AllowanceContext,
    getBaseFeeAtTimestamp: async () => BigInt(1_000_000_000),
    getCode: async () => "0x",
    getAmountsOut: async () => BigInt(0),
    ...overrides,
  };
}

describe("buildDiagnosisInput", () => {
  it("maps a successful tx straight through with no dappContext when there's no wallet-connect signal", async () => {
    const readers = mockReaders({
      findTransactionAcrossChains: async () => ({
        hash: "0x000000000000000000000000000000000000000000000000000000000000cafe",
        foundOn: [
          {
            found: true,
            chainId: X_LAYER,
            hash: "0x000000000000000000000000000000000000000000000000000000000000cafe" as `0x${string}`,
            status: "success",
            from: "0xfrom" as `0x${string}`,
            to: "0xto" as `0x${string}`,
            input: "0x38ed1739deadbeef" as `0x${string}`,
            nonce: 5,
            blockNumber: BigInt(100),
            gasUsed: BigInt(21000),
          },
        ],
        wrongNetworkSuspected: false,
      }),
    });

    const { input, deps } = await buildDiagnosisInput({ txHash: "0x000000000000000000000000000000000000000000000000000000000000cafe" as `0x${string}`, readers });

    expect(input.tx.status).toBe("success");
    expect(input.tx.functionSelector).toBe("0x38ed1739");
    expect(input.dappContext).toBeUndefined();
    expect(deps.crossChainLookup?.("0x000000000000000000000000000000000000000000000000000000000000cafe")).toBeNull();

    // classify.ts has no explicit "success" mode outside of bridge context —
    // it's a failure classifier. A plain successful tx correctly falls
    // through every rule to the generic low-confidence catch-all; the
    // orchestrator (diagnoseLive.ts) is what short-circuits this case with
    // a proper "no failure detected" result before ever calling diagnose().
    const diagnosis = diagnose(input, deps);
    expect(diagnosis.mode).toBe("UNKNOWN_PENDING");
    expect(diagnosis.ruleTriggered).toBe("diagnose:noRuleMatched");
  });

  it("uses the already-fetched cross-chain results as the wrong-network fallback with zero extra calls", async () => {
    const readers = mockReaders({
      findTransactionAcrossChains: async () => ({
        hash: "0x000000000000000000000000000000000000000000000000000000000000cafe",
        foundOn: [
          {
            found: true,
            chainId: ETH,
            hash: "0x000000000000000000000000000000000000000000000000000000000000cafe" as `0x${string}`,
            status: "success",
            from: "0xfrom" as `0x${string}`,
            to: "0xto" as `0x${string}`,
            nonce: 5,
          },
        ],
        wrongNetworkSuspected: true,
      }),
    });

    const { input, deps } = await buildDiagnosisInput({
      txHash: "0x000000000000000000000000000000000000000000000000000000000000cafe" as `0x${string}`,
      expectedChainId: X_LAYER,
      readers,
    });

    // input.tx.chainId stays the EXPECTED chain (X_LAYER), not the chain we
    // actually found it on (ETH) — classify.ts's wrong-network fallback
    // compares its cross-chain lookup result against this field, so it must
    // represent "what we expected," not "what we found," or the mismatch
    // check compares a value against itself and never fires.
    expect(input.tx.chainId).toBe(X_LAYER);
    expect(deps.crossChainLookup?.("0x000000000000000000000000000000000000000000000000000000000000cafe")).toBe(ETH);
    // Regression guard: status must be forced to "not_found" here even
    // though the tx actually succeeded on Ethereum — classify.ts's
    // wrong-network fallback only triggers on status === "not_found", so
    // reporting the real ("success") status would silently skip it.
    expect(input.tx.status).toBe("not_found");
    expect(diagnose(input, deps).mode).toBe("WRONG_NETWORK");
  });

  it("does not invoke the cross-chain fallback within the recent-submission grace window (indexing lag, not wrong network)", async () => {
    const readers = mockReaders(); // tx not found anywhere
    const now = Math.floor(Date.now() / 1000);

    const { deps } = await buildDiagnosisInput({
      txHash: "0x000000000000000000000000000000000000000000000000000000000000cafe" as `0x${string}`,
      submittedAtHint: now - 5, // 5s ago — inside the 15s grace window
      readers,
    });

    expect(deps.crossChainLookup?.("0x000000000000000000000000000000000000000000000000000000000000cafe")).toBeNull();
  });

  it("keeps the wrong-network dappContext check honest using the actually-observed chain, not a blind default", async () => {
    // Tx actually landed on Ethereum, but the caller only asked for an
    // allowance check (no genuine wallet-connect signal) — connectedChainId
    // must reflect the real observed chain so wrong-network still fires.
    const readers = mockReaders({
      findTransactionAcrossChains: async () => ({
        hash: "0x000000000000000000000000000000000000000000000000000000000000cafe",
        foundOn: [
          {
            found: true,
            chainId: ETH,
            hash: "0x000000000000000000000000000000000000000000000000000000000000cafe" as `0x${string}`,
            status: "reverted",
            from: "0xfrom" as `0x${string}`,
            to: "0xto" as `0x${string}`,
            nonce: 5,
          },
        ],
        wrongNetworkSuspected: true,
      }),
    });

    const { input } = await buildDiagnosisInput({
      txHash: "0x000000000000000000000000000000000000000000000000000000000000cafe" as `0x${string}`,
      expectedChainId: X_LAYER,
      allowanceCheck: { token: "0xtoken" as `0x${string}`, spender: "0xspender" as `0x${string}`, requiredAllowance: BigInt(1) },
      readers,
    });

    expect(input.dappContext?.expectedChainId).toBe(X_LAYER);
    expect(input.wallet.connectedChainId).toBe(ETH); // observed chain, not expectedChainId

    const diagnosis = diagnose(input);
    expect(diagnosis.mode).toBe("WRONG_NETWORK");
  });

  it("does NOT falsely disable wrong-network detection when an allowance check is requested and the chain actually matches", async () => {
    const readers = mockReaders({
      findTransactionAcrossChains: async () => ({
        hash: "0x000000000000000000000000000000000000000000000000000000000000cafe",
        foundOn: [
          {
            found: true,
            chainId: X_LAYER,
            hash: "0x000000000000000000000000000000000000000000000000000000000000cafe" as `0x${string}`,
            status: "reverted",
            from: "0xfrom" as `0x${string}`,
            to: "0xto" as `0x${string}`,
            nonce: 5,
          },
        ],
        wrongNetworkSuspected: false,
      }),
      getAllowance: async () =>
        ({
          chainId: X_LAYER,
          token: "0xtoken",
          owner: "0xfrom",
          spender: "0xspender",
          allowance: BigInt(1),
          decimals: 18,
          symbol: "TKN",
        }) as AllowanceContext,
    });

    const { input } = await buildDiagnosisInput({
      txHash: "0x000000000000000000000000000000000000000000000000000000000000cafe" as `0x${string}`,
      expectedChainId: X_LAYER,
      allowanceCheck: { token: "0xtoken" as `0x${string}`, spender: "0xspender" as `0x${string}`, requiredAllowance: BigInt(100) },
      readers,
    });

    expect(input.wallet.connectedChainId).toBe(X_LAYER);
    const diagnosis = diagnose(input);
    expect(diagnosis.mode).toBe("INSUFFICIENT_ALLOWANCE");
    expect(diagnosis.ruleTriggered).toBe("allowance:inferredFromState");
  });

  it("floors pendingNonce at confirmedNonce+1 to mitigate the known-unreliable RPC pending tag", async () => {
    const readers = mockReaders({
      findTransactionAcrossChains: async () => ({
        hash: "0x000000000000000000000000000000000000000000000000000000000000cafe",
        foundOn: [
          {
            found: true,
            chainId: X_LAYER,
            hash: "0x000000000000000000000000000000000000000000000000000000000000cafe" as `0x${string}`,
            status: "pending",
            from: "0xfrom" as `0x${string}`,
            to: "0xto" as `0x${string}`,
            nonce: 11, // one past confirmed — should NOT be flagged as a gap
          },
        ],
        wrongNetworkSuspected: false,
      }),
      getNonceContext: async () =>
        ({
          chainId: X_LAYER,
          address: "0xfrom",
          latestNonce: 10,
          pendingNonce: 10, // RPC's unreliable raw value, aliased to latest
          hasGap: false,
          hasPendingBacklog: false,
        }) as NonceContext,
    });

    const { input } = await buildDiagnosisInput({ txHash: "0x000000000000000000000000000000000000000000000000000000000000cafe" as `0x${string}`, readers });

    expect(input.wallet.pendingNonce).toBe(11); // floored, not the raw 10
    const diagnosis = diagnose(input);
    expect(diagnosis.mode).not.toBe("NONCE_GAP");
  });

  it("dappExpectedChainId lets a caller who already knows both facts trigger wrong-network via direct comparison, distinct from the search chain", async () => {
    // Tx is genuinely found and succeeds on X_LAYER (the search chain,
    // expectedChainId) — but the caller (e.g. the MCP tool) separately
    // knows the dApp expected chain ETH. This must fire WRONG_NETWORK via
    // the dappContext branch, without needing the cross-chain search
    // fallback to find a mismatch (there isn't one — the tx really is on
    // the searched chain; the mismatch is against the *dApp's* expectation).
    const readers = mockReaders({
      findTransactionAcrossChains: async () => ({
        hash: "0x000000000000000000000000000000000000000000000000000000000000cafe",
        foundOn: [
          {
            found: true,
            chainId: X_LAYER,
            hash: "0x000000000000000000000000000000000000000000000000000000000000cafe" as `0x${string}`,
            status: "success",
            from: "0xfrom" as `0x${string}`,
            to: "0xto" as `0x${string}`,
            nonce: 5,
          },
        ],
        wrongNetworkSuspected: false,
      }),
    });

    const { input } = await buildDiagnosisInput({
      txHash: "0x000000000000000000000000000000000000000000000000000000000000cafe" as `0x${string}`,
      expectedChainId: X_LAYER, // search chain — where the tx actually is
      dappExpectedChainId: ETH, // dApp's separate stated expectation
      readers,
    });

    expect(input.wallet.connectedChainId).toBe(X_LAYER);
    expect(input.dappContext?.expectedChainId).toBe(ETH);

    const diagnosis = diagnose(input);
    expect(diagnosis.mode).toBe("WRONG_NETWORK");
    expect(diagnosis.ruleTriggered).toBe("wrongNetwork:dappContextMismatch");
  });

  it("dappExpectedChainId defaults to expectedChainId when omitted, preserving prior single-chain-concept behavior", async () => {
    const readers = mockReaders({
      findTransactionAcrossChains: async () => ({
        hash: "0x000000000000000000000000000000000000000000000000000000000000cafe",
        foundOn: [
          {
            found: true,
            chainId: X_LAYER,
            hash: "0x000000000000000000000000000000000000000000000000000000000000cafe" as `0x${string}`,
            status: "reverted",
            from: "0xfrom" as `0x${string}`,
            to: "0xto" as `0x${string}`,
            nonce: 5,
          },
        ],
        wrongNetworkSuspected: false,
      }),
      getAllowance: async () =>
        ({
          chainId: X_LAYER,
          token: "0xtoken",
          owner: "0xfrom",
          spender: "0xspender",
          allowance: BigInt(1),
          decimals: 18,
          symbol: "TKN",
        }) as AllowanceContext,
    });

    const { input } = await buildDiagnosisInput({
      txHash: "0x000000000000000000000000000000000000000000000000000000000000cafe" as `0x${string}`,
      expectedChainId: X_LAYER,
      allowanceCheck: { token: "0xtoken" as `0x${string}`, spender: "0xspender" as `0x${string}`, requiredAllowance: BigInt(100) },
      readers,
    });

    // No dappExpectedChainId given — should default to expectedChainId, not force a mismatch.
    expect(input.dappContext?.expectedChainId).toBe(X_LAYER);
    expect(input.wallet.connectedChainId).toBe(X_LAYER);
    const diagnosis = diagnose(input);
    expect(diagnosis.mode).toBe("INSUFFICIENT_ALLOWANCE");
  });

  it("regression: a wrong search-target chainId must not spuriously fire the nonce rule when dappContext independently confirms no wrong-network problem", async () => {
    // Reproduces a real bug found via live MCP testing: caller passes
    // expectedChainId=ETH (a wrong guess about where to search) and
    // dappExpectedChainId=X_LAYER, for a tx that's actually on X_LAYER. The
    // dappContext check correctly finds no mismatch (wallet.connectedChainId
    // ends up X_LAYER, matching dappContext.expectedChainId=X_LAYER) — but
    // an earlier version of this function still forced tx.status to
    // "not_found" whenever the search-target chain didn't match where the
    // tx was actually found, regardless of whether dappContext already
    // resolved the question. That forced "not_found" then spuriously
    // satisfied the nonce rule's trigger condition and fired
    // NONCE_ALREADY_USED for a transaction with no real problem at all.
    const readers = mockReaders({
      findTransactionAcrossChains: async () => ({
        hash: "0x000000000000000000000000000000000000000000000000000000000000cafe",
        foundOn: [
          {
            found: true,
            chainId: X_LAYER, // actually found here, NOT on the search target (ETH)
            hash: "0x000000000000000000000000000000000000000000000000000000000000cafe" as `0x${string}`,
            status: "success",
            from: "0xfrom" as `0x${string}`,
            to: "0xto" as `0x${string}`,
            nonce: 5,
          },
        ],
        wrongNetworkSuspected: true,
      }),
      getNonceContext: async () =>
        ({
          chainId: X_LAYER,
          address: "0xfrom",
          latestNonce: 10, // deliberately higher than tx.nonce=5, so the old bug's forced "not_found" would trigger NONCE_ALREADY_USED
          pendingNonce: 10,
          hasGap: false,
          hasPendingBacklog: false,
        }) as NonceContext,
    });

    const { input } = await buildDiagnosisInput({
      txHash: "0x000000000000000000000000000000000000000000000000000000000000cafe" as `0x${string}`,
      expectedChainId: ETH, // wrong guess about where to search
      dappExpectedChainId: X_LAYER, // matches where it's actually found
      readers,
    });

    // dappContext resolves cleanly: wallet ended up right where the dApp expected.
    expect(input.wallet.connectedChainId).toBe(X_LAYER);
    expect(input.dappContext?.expectedChainId).toBe(X_LAYER);
    // The real status (success) must flow through, not a forced "not_found".
    expect(input.tx.status).toBe("success");

    const diagnosis = diagnose(input);
    expect(diagnosis.mode).not.toBe("WRONG_NETWORK");
    expect(diagnosis.mode).not.toBe("NONCE_ALREADY_USED");
  });
});
