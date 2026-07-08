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

  it("Phase 1 spec §2a: resolves the tx on its actual chain and reports its real status, not a forced not_found", async () => {
    // Under the new spec, chain resolution is a *data-gathering step*
    // (Phase 1 §2a, Phase 2 §1b), not a terminal classification. The
    // caller passed expectedChainId=X_LAYER as a search hint, but the tx
    // actually lives on Ethereum — buildDiagnosisInput must build the
    // input from Ethereum's real data honestly.
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

    const { input, resolvedChainId, networkNote } = await buildDiagnosisInput({
      txHash: "0x000000000000000000000000000000000000000000000000000000000000cafe" as `0x${string}`,
      expectedChainId: X_LAYER,
      readers,
    });

    // input.tx.chainId is now the RESOLVED chain (where the tx actually
    // lives), not a "what we expected" fiction — the pipeline diagnoses
    // what actually happened on that chain.
    expect(input.tx.chainId).toBe(ETH);
    expect(resolvedChainId).toBe(ETH);
    // Real status flows through — no more forced "not_found" gymnastics.
    expect(input.tx.status).toBe("success");
    // No dappExpectedChainId was given, so no networkNote is populated —
    // this caller was only using expectedChainId as a search hint, not as
    // a stated dApp expectation.
    expect(networkNote).toBeUndefined();
  });

  it("Phase 1 spec §2a: dApp-vs-resolved chain mismatch produces a networkNote, not a WRONG_NETWORK verdict", async () => {
    // Caller genuinely declares the dApp expected X_LAYER, but the tx
    // actually lives on Ethereum. The result: a networkNote for the
    // pipeline caller to attach, plus an HONEST diagnosis of whatever
    // happened on Ethereum.
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

    const { input, networkNote } = await buildDiagnosisInput({
      txHash: "0x000000000000000000000000000000000000000000000000000000000000cafe" as `0x${string}`,
      dappExpectedChainId: X_LAYER,
      readers,
    });

    expect(input.tx.chainId).toBe(ETH);
    expect(input.tx.status).toBe("success"); // honest, not forced
    expect(networkNote).toEqual({
      foundOn: ETH,
      expected: X_LAYER,
      message: expect.stringContaining(`chain ${ETH}`),
    });
    // diagnose() itself no longer returns WRONG_NETWORK — a successful tx
    // on the "wrong" chain still classifies as no failure; the networkNote
    // is the piece that tells the user about the chain mismatch.
    expect(diagnose(input).mode).not.toBe("WRONG_NETWORK");
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

  it("connectedChainId defaults to the resolved chain, not the search hint, when there's no wallet-connect signal", async () => {
    // The caller only asked for an allowance check (no walletConnectedChainId
    // signal). Under the new spec, wallet.connectedChainId honestly
    // defaults to the RESOLVED chain — where the tx actually is — not the
    // search-hint chain. The wrong-network signal now surfaces as a
    // networkNote (from dappExpectedChainId mismatching resolvedChainId),
    // not as a WRONG_NETWORK verdict from the pipeline.
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

    const { input, networkNote } = await buildDiagnosisInput({
      txHash: "0x000000000000000000000000000000000000000000000000000000000000cafe" as `0x${string}`,
      dappExpectedChainId: X_LAYER,
      allowanceCheck: { token: "0xtoken" as `0x${string}`, spender: "0xspender" as `0x${string}`, requiredAllowance: BigInt(1) },
      readers,
    });

    expect(input.tx.chainId).toBe(ETH);
    expect(input.dappContext?.expectedChainId).toBe(X_LAYER);
    expect(input.wallet.connectedChainId).toBe(ETH); // resolved chain, honestly
    expect(networkNote?.foundOn).toBe(ETH);
    expect(networkNote?.expected).toBe(X_LAYER);
    // The diagnosis itself reflects what actually happened on Ethereum,
    // NOT the terminal-WRONG_NETWORK behavior of the old spec.
    const diagnosis = diagnose(input);
    expect(diagnosis.mode).not.toBe("WRONG_NETWORK");
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

  it("dappExpectedChainId mismatch (against the resolved chain) surfaces as a networkNote, distinct from the search chain", async () => {
    // Tx is genuinely found and succeeds on X_LAYER (the search chain) —
    // but the caller (e.g. the MCP tool) separately declares the dApp
    // expected ETH. Under Phase 1 spec §2a this is now a networkNote, not
    // a terminal WRONG_NETWORK verdict; the underlying diagnosis reflects
    // what actually happened on X_LAYER (a successful tx).
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

    const { input, networkNote, resolvedChainId } = await buildDiagnosisInput({
      txHash: "0x000000000000000000000000000000000000000000000000000000000000cafe" as `0x${string}`,
      expectedChainId: X_LAYER, // search chain — where the tx actually is
      dappExpectedChainId: ETH, // dApp's separate stated expectation
      readers,
    });

    expect(resolvedChainId).toBe(X_LAYER);
    expect(input.wallet.connectedChainId).toBe(X_LAYER);
    expect(input.dappContext?.expectedChainId).toBe(ETH);
    expect(networkNote).toEqual({
      foundOn: X_LAYER,
      expected: ETH,
      message: expect.stringContaining(`chain ${X_LAYER}`),
    });

    const diagnosis = diagnose(input);
    expect(diagnosis.mode).not.toBe("WRONG_NETWORK");
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
    // dappExpectedChainId=X_LAYER, for a tx that's actually on X_LAYER.
    // Under Phase 1 spec §2a, chain resolution always uses the tx's
    // ACTUAL chain (X_LAYER here); real status flows through; no
    // networkNote fires because resolvedChainId === dappExpectedChainId.
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
          latestNonce: 10, // deliberately higher than tx.nonce=5, so an old bug's forced "not_found" would trigger NONCE_ALREADY_USED
          pendingNonce: 10,
          hasGap: false,
          hasPendingBacklog: false,
        }) as NonceContext,
    });

    const { input, networkNote, resolvedChainId } = await buildDiagnosisInput({
      txHash: "0x000000000000000000000000000000000000000000000000000000000000cafe" as `0x${string}`,
      expectedChainId: ETH, // wrong guess about where to search
      dappExpectedChainId: X_LAYER, // matches where it's actually found
      readers,
    });

    expect(resolvedChainId).toBe(X_LAYER);
    expect(input.tx.chainId).toBe(X_LAYER); // honest resolved chain, not the wrong search hint
    expect(input.wallet.connectedChainId).toBe(X_LAYER);
    expect(input.dappContext?.expectedChainId).toBe(X_LAYER);
    expect(input.tx.status).toBe("success"); // real status flows through
    expect(networkNote).toBeUndefined(); // resolved chain matches dApp expectation

    const diagnosis = diagnose(input);
    expect(diagnosis.mode).not.toBe("WRONG_NETWORK");
    expect(diagnosis.mode).not.toBe("NONCE_ALREADY_USED");
  });
});
