/**
 * @turpan/git-diff — Read-only git diff types
 */

// ─── Change Classification ────────────────────────────────────────────────────

export type ChangeType = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied';

export interface ChangedFile {
  /** Absolute or repo-relative path */
  path: string;
  changeType: ChangeType;
  /** Lines added / deleted (from git diff --numstat) */
  linesAdded: number;
  linesDeleted: number;
  /** For renames: the original path */
  oldPath?: string;
  /** Binary file indicator */
  binary: boolean;
  /** Score (for renames/copies, 0-100) */
  score?: number;
}

export interface DiffHunk {
  filePath: string;
  hunkIndex: number;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export type DiffLineType = 'context' | 'added' | 'deleted';

export interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

// ─── Ownership hints ─────────────────────────────────────────────────────────

export type FileOwnership =
  | 'frontend'
  | 'backend'
  | 'shared'
  | 'config'
  | 'test'
  | 'docs'
  | 'infra'
  | 'unknown';

export interface FileOwnershipHint {
  file: string;
  ownership: FileOwnership;
  confidence: number; // 0-100
}

// ─── Route / API detection ───────────────────────────────────────────────────

export interface ChangedRoute {
  route: string;
  method?: string;
  file: string;
  changeType: ChangeType;
}

export interface ChangedApi {
  path: string;
  method?: string;
  file: string;
  changeType: ChangeType;
}

export interface ChangedComponent {
  name: string;
  file: string;
  changeType: ChangeType;
}

// ─── Diff Summary ────────────────────────────────────────────────────────────

export interface DiffStats {
  totalFiles: number;
  filesAdded: number;
  filesModified: number;
  filesDeleted: number;
  filesRenamed: number;
  totalLinesAdded: number;
  totalLinesDeleted: number;
  totalAdditions: number;
  totalDeletions: number;
}

export interface DiffRiskLevel {
  level: 'low' | 'medium' | 'high' | 'critical';
  reasons: string[];
  files: string[];
}

// ─── Complete diff result ────────────────────────────────────────────────────

export interface GitDiffResult {
  baseRef: string;
  targetRef: string;
  /** Ordered list of changed files */
  files: ChangedFile[];
  hunks: DiffHunk[];
  stats: DiffStats;
  ownership: FileOwnershipHint[];
  changedRoutes: ChangedRoute[];
  changedApis: ChangedApi[];
  changedComponents: ChangedComponent[];
  riskLevel: DiffRiskLevel;
  /** True if the working tree had uncommitted changes */
  hasWorkingTreeChanges: boolean;
  /** True if refs don't exist in repo */
  refError?: string;
  /** Only present when getDiff is called on non-git-dir (always undefined in normal use) */
  _test?: never;
}

export interface DiffReviewRecommendation {
  decision: 'approve' | 'request_changes' | 'block_merge';
  confidence: 'high' | 'medium' | 'low';
  summary: string;
  reasons: string[];
  findings: DiffFinding[];
}

export interface DiffFinding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  title: string;
  explanation: string;
  file?: string;
  line?: number;
  diffLines?: DiffLine[];
  introducedBy: 'added' | 'modified' | 'deleted' | 'renamed';
}