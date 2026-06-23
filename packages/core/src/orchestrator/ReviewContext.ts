/**
 * ReviewContext — shared context passed through all review stages
 */

import type { ProjectFingerprint } from '../project/index.js';
import type { TurpanConfig } from '@turpan/shared';
import type { ScoreBreakdown } from '../findings/score.js';
import type { GitDiffResult } from '@turpan/git-diff';
import { FindingStore } from '../findings/FindingStore.js';

export interface ReviewContext {
  /** Unique ID for this review run */
  runId: string;
  /** Resolved project root path */
  projectRoot: string;
  /** Project fingerprint computed before review */
  fingerprint: ProjectFingerprint;
  /** Active config */
  config: TurpanConfig;
  /** Deep analysis mode */
  deepAnalysis: boolean;
  /** UI live test mode */
  uiAnalysis: boolean;
  /** Fix-mode: produce patch plans */
  fixMode: boolean;
  /** Central findings store */
  findings: FindingStore;
  /** All stage results in order */
  stageResults: StageResultRecord;
  /** Start timestamp */
  startTime: number;
  /** Cancellation signal */
  signal?: AbortSignal;
  /** Arbitrary metadata */
  metadata: Record<string, unknown>;
  /** Enabled plugin IDs for this run */
  enabledPlugins?: string[];
  /** UI scenario IDs to run */
  uiScenarios?: string[];
  /** Skip scenario library */
  skipScenarios?: boolean;
  /** Diff-review mode: focus on changed files from a git diff */
  diffMode?: boolean;
  /** The git diff result — populated when diffMode is true */
  diffResult?: GitDiffResult;
}

export interface StageResultRecord {
  [stageId: string]: {
    status: string;
    durationMs: number;
    findingCount: number;
    error?: string;
  };
}

export function createReviewContext(
  projectRoot: string,
  fingerprint: ProjectFingerprint,
  config: TurpanConfig,
  options: {
    deepAnalysis?: boolean;
    uiAnalysis?: boolean;
    fixMode?: boolean;
    signal?: AbortSignal;
    uiScenarios?: string[];
    skipScenarios?: boolean;
    diffMode?: boolean;
    diffResult?: GitDiffResult;
  } = {}
): ReviewContext {
  return {
    runId: `run-${Date.now().toString(36)}`,
    projectRoot,
    fingerprint,
    config,
    deepAnalysis: options.deepAnalysis ?? false,
    uiAnalysis: options.uiAnalysis ?? false,
    fixMode: options.fixMode ?? false,
    findings: new FindingStore(),
    stageResults: {},
    startTime: Date.now(),
    signal: options.signal,
    metadata: {},
    uiScenarios: options.uiScenarios,
    skipScenarios: options.skipScenarios,
    diffMode: options.diffMode ?? false,
    diffResult: options.diffResult,
  };
}

export function elapsedMs(ctx: ReviewContext): number {
  return Date.now() - ctx.startTime;
}
