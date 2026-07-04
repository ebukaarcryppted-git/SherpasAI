import { useCallback, useEffect, useRef, useState } from "react";
import { callDiagnoseTool } from "./mcpClient.js";
import type { Diagnosis } from "./types.js";

/**
 * Staged, honest loading copy — not a generic spinner. A 2-3s live-RPC wait
 * reads as broken with a spinner alone; naming what's actually happening
 * (and that it takes a moment) reads as intentional. See widget spec
 * section 4.
 */
const DIAGNOSING_STAGES = [
  "Checking transaction status…",
  "Reading wallet state…",
  "Comparing to network conditions…",
  "Classifying the result…",
];

export type WidgetView =
  | "collapsed"
  | "prompt"
  | "input"
  | "diagnosing"
  | "result"
  | "action"
  | "resolved"
  | "escalate"
  | "error";

export interface WidgetState {
  view: WidgetView;
  txHash: string;
  diagnosingStage: number;
  diagnosis: Diagnosis | null;
  errorMessage: string | null;
  actionError: string | null;
}

export interface UseSupportWidgetOptions {
  mcpEndpoint: string;
  chainId: number;
  expectedChainId?: number;
}

const INITIAL_STATE: WidgetState = {
  view: "collapsed",
  txHash: "",
  diagnosingStage: 0,
  diagnosis: null,
  errorMessage: null,
  actionError: null,
};

export function useSupportWidget(options: UseSupportWidgetOptions) {
  const [state, setState] = useState<WidgetState>(INITIAL_STATE);
  const stageTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearStageTimer = useCallback(() => {
    if (stageTimerRef.current) {
      clearInterval(stageTimerRef.current);
      stageTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearStageTimer, [clearStageTimer]);

  const open = useCallback(() => {
    setState((s) => (s.view === "collapsed" ? { ...s, view: "input" } : s));
  }, []);

  const close = useCallback(() => {
    clearStageTimer();
    setState(INITIAL_STATE);
  }, [clearStageTimer]);

  const setTxHash = useCallback((txHash: string) => {
    setState((s) => ({ ...s, txHash }));
  }, []);

  const submit = useCallback(
    async (txHashOverride?: string) => {
      const txHash = (txHashOverride ?? state.txHash).trim();
      if (!txHash) return;

      clearStageTimer();
      setState((s) => ({ ...s, view: "diagnosing", txHash, diagnosingStage: 0, errorMessage: null }));

      stageTimerRef.current = setInterval(() => {
        setState((s) => ({ ...s, diagnosingStage: Math.min(s.diagnosingStage + 1, DIAGNOSING_STAGES.length - 1) }));
      }, 900);

      try {
        const diagnosis = await callDiagnoseTool(options.mcpEndpoint, {
          txHash,
          chainId: options.chainId,
          expectedChainId: options.expectedChainId,
        });
        clearStageTimer();
        setState((s) => ({ ...s, view: "result", diagnosis }));
      } catch (err) {
        clearStageTimer();
        const message = err instanceof Error ? err.message : "Something went wrong reaching the diagnosis service.";
        setState((s) => ({ ...s, view: "error", errorMessage: message }));
      }
    },
    [state.txHash, options.mcpEndpoint, options.chainId, options.expectedChainId, clearStageTimer]
  );

  const startAction = useCallback(() => {
    setState((s) => (s.diagnosis ? { ...s, view: "action", actionError: null } : s));
  }, []);

  const resolveAction = useCallback(() => {
    setState((s) => ({ ...s, view: "resolved" }));
  }, []);

  const failAction = useCallback((message: string) => {
    setState((s) => ({ ...s, view: "result", actionError: message }));
  }, []);

  const escalate = useCallback((reason: string) => {
    setState((s) => ({ ...s, view: "escalate", errorMessage: reason }));
  }, []);

  const reset = useCallback(() => {
    clearStageTimer();
    setState((s) => ({ ...INITIAL_STATE, view: s.view === "collapsed" ? "collapsed" : "input" }));
  }, [clearStageTimer]);

  /**
   * Passive detection (spec section 2a): surfaces a prompt rather than
   * jumping straight to diagnosing — "looks like that didn't go through,
   * want me to check why?" is a question, not an assumption. Only takes
   * effect from the collapsed state, so it never interrupts something the
   * user is already doing with the widget.
   */
  const promptForTx = useCallback((txHash: string) => {
    setState((s) => (s.view === "collapsed" ? { ...s, view: "prompt", txHash } : s));
  }, []);

  const dismissPrompt = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return {
    state,
    diagnosingLabel: DIAGNOSING_STAGES[state.diagnosingStage],
    open,
    close,
    setTxHash,
    submit,
    startAction,
    resolveAction,
    failAction,
    escalate,
    reset,
    promptForTx,
    dismissPrompt,
  };
}
