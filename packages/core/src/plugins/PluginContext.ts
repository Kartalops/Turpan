/**
 * PluginContext — context passed to plugins during registration and execution.
 * Provides access to project metadata, configuration, and cancellation.
 */

import type { ProjectFingerprint } from '../project/index.js';
import type { TurpanConfig } from '@turpan/shared';

/**
 * Context provided to plugins at registration time.
 * Plugins receive this context once and should cache any info they need.
 */
export interface PluginContext {
  /** Absolute path to the project root */
  projectRoot: string;
  /** Pre-computed project fingerprint */
  fingerprint: ProjectFingerprint;
  /** Absolute path to the .turpan/ directory */
  turpanDir: string;
  /** turpan.yml parsed config */
  config: Partial<TurpanConfig>;
  /** Optional AbortSignal for cancellation */
  signal?: AbortSignal;
}

/**
 * Runtime context available during analyzer/fixer execution.
 * Extends PluginContext with run-specific information.
 */
export interface PluginRuntimeContext extends PluginContext {
  /** Current run ID */
  runId?: string;
  /** Whether fix mode is enabled */
  fixMode: boolean;
  /** Whether deep analysis is enabled */
  deepAnalysis: boolean;
  /** Enabled plugin IDs for this run */
  enabledPlugins: string[];
}

/**
 * Build a standard PluginContext from project root and config.
 */
export function buildPluginContext(
  projectRoot: string,
  fingerprint: ProjectFingerprint,
  config: Partial<TurpanConfig>,
  signal?: AbortSignal
): PluginContext {
  return {
    projectRoot,
    fingerprint,
    turpanDir: `${projectRoot}/.turpan`,
    config,
    signal,
  };
}
