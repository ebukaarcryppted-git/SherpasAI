import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useAccount, usePublicClient, useSendTransaction, useSwitchChain, useWaitForTransactionReceipt } from "wagmi";
import type { Address, Hash } from "viem";
import { colors, font } from "./theme.js";
import { useSupportWidget } from "./useSupportWidget.js";
import { ShadowHost } from "./ShadowHost.js";
import { CollapsedTrigger } from "./components/CollapsedTrigger.js";
import { WidgetPanel } from "./components/WidgetPanel.js";
import { DiagnosisCard, type ActionContext } from "./components/DiagnosisCard.js";
import { AlertIcon, CheckIcon } from "./components/Icons.js";
import { buildApproveCalldata, buildRetrySwapCalldata, bumpFee } from "./calldata.js";

export interface SupportWidgetProps {
  /** Chain the host dApp expects the wallet to be on — passed to the MCP tool as expectedChainId, and used as the switch-network target. */
  expectedChainId: number;
  /** URL of a deployed diagnose_transaction MCP server, e.g. https://your-mcp-server.com/mcp */
  mcpEndpoint: string;
  /** Optional theme override, shallow-merged over the default dark near-monochrome palette. */
  theme?: Partial<typeof colors>;
  /** Optional: supplied only when the host already knows which token/spender an approval failure involved. */
  actionContext?: ActionContext;
  /** Optional: builds a block-explorer link shown when no automated action is available. */
  explorerUrlFor?: (txHash: string, chainId: number) => string;
  /** Optional: where "Talk to a human" should go. Omit to hide the escalation link entirely rather than dead-end it. */
  supportUrl?: string;
  /**
   * Passive detection (spec section 2a): supply the hash of a transaction
   * the host dApp just submitted, and the widget watches for it via wagmi
   * and surfaces a "looks like that didn't go through" prompt if it
   * reverts or doesn't confirm within watchTimeoutMs. Only works for txs
   * submitted during the session the widget is mounted in, by design —
   * there's no way to eavesdrop on a wallet's activity the widget wasn't
   * told about.
   */
  watchTxHash?: Hash;
  watchTimeoutMs?: number;
}

const resultWrapStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 10 };
const textStyle: CSSProperties = { fontFamily: font.ui, fontSize: 13, color: colors.textMuted, lineHeight: 1.5, margin: 0 };
const inputRowStyle: CSSProperties = { display: "flex", gap: 8 };
const inputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontFamily: font.mono,
  fontSize: 12,
  color: colors.text,
  background: colors.bgElevated,
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  padding: "9px 10px",
};
const primaryButtonStyle: CSSProperties = {
  cursor: "pointer",
  fontFamily: font.ui,
  fontSize: 13,
  fontWeight: 600,
  color: colors.bg,
  background: colors.text,
  border: "none",
  borderRadius: 6,
  padding: "9px 14px",
};
const stageLineStyle: CSSProperties = { fontFamily: font.mono, fontSize: 12, color: colors.textMuted };

export function SupportWidget(props: SupportWidgetProps) {
  return (
    <ShadowHost>
      <SupportWidgetInner {...props} />
    </ShadowHost>
  );
}

function SupportWidgetInner({
  expectedChainId,
  mcpEndpoint,
  actionContext,
  explorerUrlFor,
  supportUrl,
  watchTxHash,
  watchTimeoutMs = 30_000,
}: SupportWidgetProps) {
  const widget = useSupportWidget({ mcpEndpoint, chainId: expectedChainId, expectedChainId });
  const [inputValue, setInputValue] = useState("");
  const [actionState, setActionState] = useState<"idle" | "pending" | "error">("idle");
  const [actionError, setActionError] = useState<string | null>(null);

  const account = useAccount();
  const publicClient = usePublicClient({ chainId: expectedChainId });
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();

  // Passive detection (spec section 2a) — watches a host-supplied hash and
  // surfaces a prompt (not an auto-diagnosis) on revert or timeout.
  const receipt = useWaitForTransactionReceipt({ hash: watchTxHash, chainId: expectedChainId });
  const promptedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!watchTxHash || promptedRef.current === watchTxHash) return;

    if (receipt.data?.status === "reverted") {
      promptedRef.current = watchTxHash;
      widget.promptForTx(watchTxHash);
      return;
    }

    if (receipt.isError) {
      const timer = setTimeout(() => {
        if (promptedRef.current !== watchTxHash) {
          promptedRef.current = watchTxHash;
          widget.promptForTx(watchTxHash);
        }
      }, watchTimeoutMs);
      return () => clearTimeout(timer);
    }
  }, [watchTxHash, receipt.data?.status, receipt.isError, watchTimeoutMs, widget]);

  const runAction = useCallback(async () => {
    const diagnosis = widget.state.diagnosis;
    if (!diagnosis) return;
    setActionState("pending");
    setActionError(null);

    try {
      switch (diagnosis.mode) {
        case "WRONG_NETWORK": {
          const target = Number(diagnosis.evidence.expected ?? diagnosis.evidence.expectedChainId);
          if (!target) throw new Error("Couldn't determine which chain to switch to.");
          await switchChainAsync({ chainId: target });
          break;
        }

        case "GAS_UNDERPRICED": {
          if (!publicClient) throw new Error("No chain connection available to read the stuck transaction.");
          const tx = await publicClient.getTransaction({ hash: widget.state.txHash as Hash });
          const currentTxFee = diagnosis.evidence.txFee ? BigInt(String(diagnosis.evidence.txFee)) : (tx.maxFeePerGas ?? tx.gasPrice ?? 0n);
          const currentNetworkFee = diagnosis.evidence.currentGasPrice
            ? BigInt(String(diagnosis.evidence.currentGasPrice))
            : await publicClient.getGasPrice();
          const newFee = bumpFee(currentTxFee, currentNetworkFee);
          await sendTransactionAsync({
            to: tx.to ?? undefined,
            data: tx.input,
            value: tx.value,
            nonce: tx.nonce,
            maxFeePerGas: newFee,
            maxPriorityFeePerGas: newFee,
          });
          break;
        }

        case "INSUFFICIENT_ALLOWANCE": {
          if (!actionContext?.token || !actionContext?.spender) {
            throw new Error("Missing token/spender address — nothing to approve.");
          }
          const calldata = buildApproveCalldata(actionContext.spender as Address);
          await sendTransactionAsync({ to: actionContext.token as Address, data: calldata });
          break;
        }

        case "SLIPPAGE_REVERT": {
          if (!diagnosis.quantifiedSlippage) throw new Error("No quantified price data to retry with.");
          if (!publicClient) throw new Error("No chain connection available to read the original swap.");
          if (!account.address) throw new Error("Connect a wallet first.");
          const tx = await publicClient.getTransaction({ hash: widget.state.txHash as Hash });
          if (!tx.to) throw new Error("Original transaction had no target contract.");
          const { calldata } = buildRetrySwapCalldata({
            quantified: diagnosis.quantifiedSlippage,
            recipient: account.address,
          });
          await sendTransactionAsync({ to: tx.to, data: calldata });
          break;
        }

        default:
          throw new Error("No automated action is available for this diagnosis.");
      }

      setActionState("idle");
      widget.resolveAction();
    } catch (err) {
      setActionState("error");
      setActionError(err instanceof Error ? err.message : "The wallet action failed or was rejected.");
    }
  }, [widget, publicClient, account.address, switchChainAsync, sendTransactionAsync, actionContext]);

  if (widget.state.view === "collapsed") {
    return <CollapsedTrigger onClick={widget.open} />;
  }

  if (widget.state.view === "prompt") {
    return (
      <div
        style={{
          fontFamily: font.ui,
          width: 260,
          padding: 14,
          background: colors.bg,
          border: `1px solid ${colors.borderStrong}`,
          borderRadius: 8,
          color: colors.text,
        }}
      >
        <p style={{ ...textStyle, color: colors.text, marginBottom: 10 }}>
          Looks like that didn't go through — want me to check why?
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" style={{ ...primaryButtonStyle, flex: 1 }} onClick={() => widget.submit(widget.state.txHash)}>
            Check it
          </button>
          <button
            type="button"
            style={{ ...primaryButtonStyle, flex: 1, background: colors.bgElevated, color: colors.textMuted, border: `1px solid ${colors.border}` }}
            onClick={widget.dismissPrompt}
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  return (
    <WidgetPanel onClose={widget.close}>
      {widget.state.view === "input" && (
        <div style={resultWrapStyle}>
          <p style={textStyle}>Paste the transaction hash you'd like checked.</p>
          <div style={inputRowStyle}>
            <input
              style={inputStyle}
              placeholder="0x…"
              aria-label="Transaction hash"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                widget.setTxHash(e.target.value);
              }}
            />
            <button type="button" style={primaryButtonStyle} onClick={() => widget.submit()}>
              Check
            </button>
          </div>
        </div>
      )}

      {widget.state.view === "diagnosing" && (
        <div style={resultWrapStyle}>
          <p style={stageLineStyle}>{widget.diagnosingLabel}</p>
        </div>
      )}

      {widget.state.view === "error" && (
        <div style={resultWrapStyle}>
          <p style={{ ...textStyle, color: colors.signalProblem }}>{widget.state.errorMessage}</p>
          <button type="button" style={primaryButtonStyle} onClick={widget.reset}>
            Try again
          </button>
        </div>
      )}

      {(widget.state.view === "result" || widget.state.view === "action") && widget.state.diagnosis && (
        <DiagnosisCard
          diagnosis={widget.state.diagnosis}
          explorerUrl={explorerUrlFor?.(widget.state.txHash, expectedChainId)}
          actionState={actionState}
          actionError={actionError}
          actionContext={actionContext}
          onRunAction={runAction}
          onEscalate={() => widget.escalate("User requested human support.")}
        />
      )}

      {widget.state.view === "resolved" && (
        <div style={resultWrapStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: colors.signalResolved }}>
            <CheckIcon />
            <span style={{ ...textStyle, color: colors.signalResolved, fontWeight: 600 }}>Fix submitted</span>
          </div>
          <p style={textStyle}>Your wallet should confirm this shortly. Check back if it doesn't go through.</p>
          <button type="button" style={primaryButtonStyle} onClick={widget.reset}>
            Done
          </button>
        </div>
      )}

      {widget.state.view === "escalate" && (
        <div style={resultWrapStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: colors.textMuted }}>
            <AlertIcon />
            <span style={{ ...textStyle, fontWeight: 600 }}>Couldn't resolve this automatically</span>
          </div>
          {supportUrl ? (
            <a href={supportUrl} target="_blank" rel="noreferrer" style={{ ...textStyle, color: colors.text }}>
              Contact support →
            </a>
          ) : (
            <p style={textStyle}>No support contact has been configured for this dApp yet.</p>
          )}
        </div>
      )}
    </WidgetPanel>
  );
}
