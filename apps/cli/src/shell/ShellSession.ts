/**
 * ShellSession — manages the state of a single shell session.
 * Coordinates running flag, history navigation, and current mode.
 */

import type { Intent } from '@turpan/shared';
import { CommandMemory, type ShellMode } from './CommandMemory.js';

export interface SessionConfig {
  projectPath: string;
  projectName: string;
  projectType: string;
}

export class ShellSession {
  private _running: boolean = true;
  private memory: CommandMemory;
  config: SessionConfig;

  constructor(config: SessionConfig, memory?: CommandMemory) {
    this.config = config;
    this.memory = memory ?? new CommandMemory();
  }

  // ── Running state ──────────────────────────────────────────────────────────

  get running(): boolean {
    return this._running;
  }

  stop(): void {
    this._running = false;
  }

  // ── Memory delegation ──────────────────────────────────────────────────────

  get commandMemory(): CommandMemory {
    return this.memory;
  }

  get lastRunId(): string | null {
    return this.memory.lastRunId;
  }

  get lastFindings() {
    return this.memory.lastFindings;
  }

  get lastScorecard() {
    return this.memory.lastScorecard;
  }

  get projectStarted(): boolean {
    return this.memory.projectStarted;
  }

  get selectedMode(): ShellMode {
    return this.memory.selectedMode;
  }

  get commandHistory(): string[] {
    return this.memory.getHistory();
  }

  // ── Mode helpers ───────────────────────────────────────────────────────────

  /**
   * Map an intent to a shell mode for display / tracking.
   */
  static intentToMode(intent: Intent): ShellMode {
    switch (intent) {
      case 'analyze':
      case 'deep_review':
        return 'analyze';
      case 'review':
      case 'quick_review':
      case 'code_quality_review':
        return 'review';
      case 'ui':
      case 'ui_review':
        return 'ui';
      case 'runtime_review':
      case 'test':
        return 'runtime';
      case 'security_review':
        return 'security';
      case 'cleanup_review':
      case 'clean':
      case 'cleanup-scan':
      case 'find-unused':
        return 'cleanup';
      case 'fix':
      case 'fix_safe':
      case 'patch_only':
      case 'apply_fix':
        return 'fix';
      case 'report':
      case 'generate_report':
      case 'open_report':
      case 'show_findings':
      case 'show_scorecard':
        return 'report';
      default:
        return 'review';
    }
  }

  // ── History navigation ─────────────────────────────────────────────────────

  pushCommand(command: string): void {
    this.memory.pushHistory(command);
  }

  getPreviousCommand(): string | null {
    return this.memory.getPreviousCommand();
  }

  getNextCommand(): string | null {
    return this.memory.getNextCommand();
  }

  resetHistoryIndex(): void {
    this.memory.resetHistoryIndex();
  }

  // ── Mode tracking ──────────────────────────────────────────────────────────

  setMode(mode: ShellMode): void {
    this.memory.setMode(mode);
  }

  setProjectStarted(started: boolean): void {
    this.memory.setProjectStarted(started);
  }

  // ── Session snapshot ───────────────────────────────────────────────────────

  isValid(): boolean {
    return this._running;
  }

  summary(): string {
    return [
      `project: ${this.config.projectName}`,
      `mode: ${this.selectedMode}`,
      `runId: ${this.lastRunId ?? 'none'}`,
      `findings: ${this.lastFindings.length}`,
    ].join(' | ');
  }
}