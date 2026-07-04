import type { live, classify } from "@support-agent-asp/agent-core";

/**
 * Re-exported, not redefined — this package has no diagnosis types of its
 * own. `LiveDiagnosis` is what `live.diagnoseLive()` (Phase 2) returns;
 * `Diagnosis` / `DiagnosisInput` are the underlying Phase 1 rule-engine
 * shapes it wraps.
 */
export type LiveDiagnosis = live.LiveDiagnosis;
export type DiagnoseLiveParams = live.DiagnoseLiveParams;
export type Diagnosis = classify.Diagnosis;
export type DiagnosisInput = classify.DiagnosisInput;
export type ClassifiedMode = classify.ClassifiedMode;
