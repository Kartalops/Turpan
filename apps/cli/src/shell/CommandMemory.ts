/**
 * CommandMemory — persists session state across commands.
 * Remembers last run id, findings, project state, and selected mode.
 */

import type { Finding, Scorecard, RunMetadata } from '@turpan/shared';

export interface ShellMemory {
  lastRunId: string | null;
  lastFindings: Finding[];
  lastScorecard: Scorecard | null;
  lastRunMetadata: RunMetadata | null;
  projectStarted: boolean;
  selectedMode: ShellMode;
  commandHistory: string[];
  historyIndex: number;
  /** True when getNextCommand has moved past the newest entry */
  historyExhaustedForward: boolean;
}

export type ShellMode =
  | 'analyze'
  | 'review'
  | 'quick'
  | 'ui'
  | 'runtime'
  | 'security'
  | 'cleanup'
  | 'fix'
  | 'report';

const DEFAULT_MEMORY = (): ShellMemory => ({
  lastRunId: null,
  lastFindings: [],
  lastScorecard: null,
  lastRunMetadata: null,
  projectStarted: false,
  selectedMode: 'review',
  commandHistory: [],
  historyIndex: -1,
  historyExhaustedForward: false,
});

export class CommandMemory {
  private memory: ShellMemory;

  constructor() {
    // Create a fresh copy each time so test isolation is guaranteed
    this.memory = DEFAULT_MEMORY();
  }

  // ── Run memory ─────────────────────────────────────────────────────────────

  get lastRunId(): string | null {
    return this.memory.lastRunId;
  }

  setLastRun(id: string, metadata?: Partial<RunMetadata>): void {
    this.memory.lastRunId = id;
    if (metadata) {
      this.memory.lastRunMetadata = {
        id,
        timestamp: metadata.timestamp ?? new Date().toISOString(),
        projectPath: metadata.projectPath ?? '',
        analysisType: metadata.analysisType ?? 'unknown',
        status: metadata.status ?? 'completed',
        duration: metadata.duration,
        error: metadata.error,
      };
    }
  }

  get lastRunMetadata(): RunMetadata | null {
    return this.memory.lastRunMetadata;
  }

  // ── Findings memory ────────────────────────────────────────────────────────

  setFindings(findings: Finding[]): void {
    this.memory.lastFindings = findings;
  }

  get lastFindings(): Finding[] {
    return this.memory.lastFindings;
  }

  setScorecard(scorecard: Scorecard): void {
    this.memory.lastScorecard = scorecard;
  }

  get lastScorecard(): Scorecard | null {
    return this.memory.lastScorecard;
  }

  // ── Project state ──────────────────────────────────────────────────────────

  setProjectStarted(started: boolean): void {
    this.memory.projectStarted = started;
  }

  get projectStarted(): boolean {
    return this.memory.projectStarted;
  }

  // ── Mode ───────────────────────────────────────────────────────────────────

  setMode(mode: ShellMode): void {
    this.memory.selectedMode = mode;
  }

  get selectedMode(): ShellMode {
    return this.memory.selectedMode;
  }

  // ── Command history ────────────────────────────────────────────────────────

  pushHistory(command: string): void {
    if (!command.trim()) return;
    // Avoid duplicate consecutive entries
    if (this.memory.commandHistory[0] === command) return;
    this.memory.commandHistory.unshift(command);
    // Keep last 100 entries
    if (this.memory.commandHistory.length > 100) {
      this.memory.commandHistory.pop();
    }
    this.memory.historyIndex = -1;
    this.memory.historyExhaustedForward = false;
  }

  getHistory(): string[] {
    return [...this.memory.commandHistory];
  }

  getPreviousCommand(): string | null {
    if (this.memory.commandHistory.length === 0) return null;
    // Reset forward-exhaustion when moving backward
    this.memory.historyExhaustedForward = false;
    const nextIndex = this.memory.historyIndex + 1;
    if (nextIndex >= this.memory.commandHistory.length) {
      this.memory.historyIndex = this.memory.commandHistory.length - 1;
      return this.memory.commandHistory[this.memory.commandHistory.length - 1];
    }
    this.memory.historyIndex = nextIndex;
    return this.memory.commandHistory[nextIndex];
  }

  getNextCommand(): string | null {
    if (this.memory.commandHistory.length === 0) return null;
    if (this.memory.historyExhaustedForward) return '';

    // historyIndex < 0 means "not started" — start at newest (index 0)
    if (this.memory.historyIndex < 0) {
      this.memory.historyIndex = 0;
      return this.memory.commandHistory[0];
    }

    // At newest (index 0) — signal exhaustion
    if (this.memory.historyIndex === 0) {
      this.memory.historyExhaustedForward = true;
      return '';
    }

    // Return next newer item
    this.memory.historyIndex--;
    return this.memory.commandHistory[this.memory.historyIndex];
  }

  resetHistoryIndex(): void {
    this.memory.historyIndex = -1;
    this.memory.historyExhaustedForward = false;
  }

  // ── Reset ──────────────────────────────────────────────────────────────────

  reset(): void {
    const prev = this.memory.commandHistory;
    this.memory = DEFAULT_MEMORY();
    this.memory.commandHistory = prev;
    this.memory.historyExhaustedForward = false;
  }

  /**
   * Snapshot of current memory state — useful for debugging.
   */
  toJSON(): Omit<ShellMemory, 'commandHistory'> & { commandCount: number } {
    return {
      lastRunId: this.memory.lastRunId,
      lastFindings: this.memory.lastFindings,
      lastScorecard: this.memory.lastScorecard,
      lastRunMetadata: this.memory.lastRunMetadata,
      projectStarted: this.memory.projectStarted,
      selectedMode: this.memory.selectedMode,
      commandCount: this.memory.commandHistory.length,
    };
  }
}