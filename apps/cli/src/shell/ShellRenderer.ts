/**
 * ShellRenderer — handles all terminal output for the interactive shell.
 * Shows progress stages, summaries, artifact paths, and formatted findings.
 */

import chalk from 'chalk';
import type { Finding, Scorecard, RunMetadata } from '@turpan/shared';
import { getIntentLabel } from './intent.js';

export interface RenderOptions {
  compact?: boolean;
  showTimestamp?: boolean;
}

const SEP = chalk.dim('─'.repeat(44));

export class ShellRenderer {
  private compact: boolean;

  constructor(options: RenderOptions = {}) {
    this.compact = options.compact ?? false;
  }

  // ── Greeting / Header ──────────────────────────────────────────────────────

  greeting(): void {
    console.log(chalk.bold('\n  🐪  Turpan Review Shell'));
    console.log(chalk.dim('  Interactive Review & Fix Agent\n'));
  }

  projectInfo(lines: string[]): void {
    console.log(chalk.bold('  📁 Project Detected'));
    console.log(chalk.dim('  ' + '─'.repeat(42)));
    for (const line of lines) {
      console.log('  ' + line);
    }
    console.log(chalk.dim('  ' + '─'.repeat(42) + '\n'));
  }

  help(categories: Record<string, string[]>): void {
    console.log(chalk.bold('\n  Available Commands\n'));
    for (const [category, commands] of Object.entries(categories)) {
      console.log(chalk.cyan(`  ${category}:`));
      for (const cmd of commands) {
        console.log(chalk.dim(`    • ${cmd}`));
      }
      console.log();
    }
    console.log(chalk.dim('  Slash commands: /review  /fix  /report  /open  /doctor\n'));
  }

  status(mode: string, runId: string | null, findingsCount: number): void {
    console.log(chalk.bold('\n  Status'));
    console.log(chalk.dim('  ' + '─'.repeat(42)));
    console.log(`  Mode:        ${chalk.cyan(mode)}`);
    console.log(`  Last Run:    ${runId ? chalk.green(runId) : chalk.dim('none')}`);
    console.log(`  Findings:    ${findingsCount > 0 ? chalk.yellow(String(findingsCount)) : chalk.dim('0')}`);
    console.log(chalk.dim('  ' + '─'.repeat(42) + '\n'));
  }

  // ── Progress stages ────────────────────────────────────────────────────────

  stageStart(label: string, description?: string): void {
    const icon = chalk.cyan('⏳');
    const text = chalk.bold(`${icon}  ${label}`);
    const desc = description ? chalk.dim(` — ${description}`) : '';
    console.log(text + desc);
  }

  stageComplete(label: string, durationMs?: number): void {
    const icon = chalk.green('✓');
    const text = chalk.bold(`${icon}  ${label}`);
    const dur = durationMs !== undefined ? chalk.dim(` (${durationMs}ms)`) : '';
    console.log(text + dur);
  }

  stageFail(label: string, error?: string): void {
    const icon = chalk.red('✗');
    const text = chalk.bold(`${icon}  ${label}`);
    const err = error ? chalk.red(` — ${error}`) : '';
    console.log(text + err);
  }

  stageSkip(label: string, reason?: string): void {
    const icon = chalk.dim('○');
    const text = `${icon}  ${chalk.dim(label)}`;
    const reasonText = reason ? chalk.dim(` — ${reason}`) : '';
    console.log(text + reasonText);
  }

  /**
   * Render a sequence of stages with progress indicators.
   */
  renderStages(
    stages: Array<{ id: string; label: string; status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'; durationMs?: number; error?: string }>
  ): void {
    if (this.compact) {
      // Compact: single line per stage
      for (const stage of stages) {
        switch (stage.status) {
          case 'completed':
            this.stageComplete(stage.label, stage.durationMs);
            break;
          case 'failed':
            this.stageFail(stage.label, stage.error);
            break;
          case 'skipped':
            this.stageSkip(stage.label);
            break;
          case 'running':
            this.stageStart(stage.label);
            break;
          default:
            this.stageSkip(stage.label, 'pending');
        }
      }
    } else {
      // Full: grouped with separators
      for (const stage of stages) {
        switch (stage.status) {
          case 'completed':
            this.stageComplete(stage.label, stage.durationMs);
            break;
          case 'failed':
            this.stageFail(stage.label, stage.error);
            break;
          case 'skipped':
            this.stageSkip(stage.label, 'skipped by config');
            break;
          case 'running':
            this.stageStart(stage.label);
            break;
          default:
            this.stageSkip(stage.label, 'not run');
        }
      }
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  runSummary(result: {
    runId: string;
    durationMs: number;
    findingsCount: number;
    verdict: string;
    reportPath?: string;
  }): void {
    console.log(chalk.bold('\n  Run Summary'));
    console.log(chalk.dim('  ' + '─'.repeat(42)));
    console.log(`  Run ID:      ${chalk.cyan(result.runId)}`);
    console.log(`  Duration:    ${chalk.dim(String(result.durationMs) + 'ms')}`);
    console.log(`  Findings:    ${result.findingsCount > 0 ? chalk.yellow(String(result.findingsCount)) : chalk.green('0')}`);
    console.log(`  Verdict:     ${this.formatVerdict(result.verdict)}`);
    if (result.reportPath) {
      console.log(`  Report:      ${chalk.dim(result.reportPath)}`);
    }
    console.log(chalk.dim('  ' + '─'.repeat(42) + '\n'));
  }

  private formatVerdict(verdict: string): string {
    switch (verdict) {
      case 'GO':
        return chalk.green('✅ GO');
      case 'CONDITIONAL_GO':
        return chalk.yellow('⚠️  CONDITIONAL_GO');
      case 'NO_GO':
        return chalk.red('❌ NO_GO');
      case 'INTERNAL_ONLY':
        return chalk.yellow('🔒 INTERNAL_ONLY');
      default:
        return chalk.dim(verdict);
    }
  }

  // ── Findings ───────────────────────────────────────────────────────────────

  findingsSummary(findings: Finding[], limit = 20): void {
    if (findings.length === 0) {
      console.log(chalk.green('\n  ✅ No findings!\n'));
      return;
    }

    console.log(chalk.bold(`\n  Findings (${findings.length} total)`));
    console.log(chalk.dim('  ' + '─'.repeat(42)));

    const sorted = [...findings].sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
      return order[a.severity] - order[b.severity];
    });

    const shown = sorted.slice(0, limit);
    for (const f of shown) {
      this.renderFinding(f);
    }

    if (findings.length > limit) {
      console.log(chalk.dim(`\n  ... and ${findings.length - limit} more.`));
    }
    console.log();
  }

  private renderFinding(f: Finding): void {
    const sev = this.severityIcon(f.severity);
    const title = chalk.bold(`${sev}  ${f.title}`);
    const location = f.file
      ? chalk.dim(` ${f.file}${f.line ? `:${f.line}` : ''}`)
      : '';

    console.log(`  ${title}${location}`);
    if (!this.compact && f.explanation) {
      const expl = f.explanation.length > 80
        ? f.explanation.slice(0, 77) + '...'
        : f.explanation;
      console.log(chalk.dim(`    ${expl}`));
    }
  }

  private severityIcon(severity: string): string {
    switch (severity) {
      case 'critical': return chalk.red('🔥');
      case 'high':     return chalk.red('✗');
      case 'medium':   return chalk.yellow('⚠');
      case 'low':      return chalk.blue('○');
      case 'info':     return chalk.dim('·');
      default:         return chalk.dim('·');
    }
  }

  // ── Scorecard ──────────────────────────────────────────────────────────────

  scorecard(scorecard: Scorecard): void {
    console.log(chalk.bold('\n  Scorecard'));
    console.log(chalk.dim('  ' + '─'.repeat(42)));
    console.log(`  Overall:         ${this.scoreColor(scorecard.overall)} ${scorecard.overall}/100`);

    const cats = scorecard.categories;
    console.log(`  Correctness:     ${this.scoreColor(cats.correctness)} ${cats.correctness}/100`);
    console.log(`  Security:        ${this.scoreColor(cats.security)} ${cats.security}/100`);
    console.log(`  Performance:     ${this.scoreColor(cats.performance)} ${cats.performance}/100`);
    console.log(`  Maintainability: ${this.scoreColor(cats.maintainability)} ${cats.maintainability}/100`);
    console.log(`  Code Coverage:   ${this.scoreColor(cats.codeCoverage)} ${cats.codeCoverage}/100`);
    console.log(chalk.dim('  ' + '─'.repeat(42)));
    console.log(`  Critical Issues: ${scorecard.criticalIssues > 0 ? chalk.red(String(scorecard.criticalIssues)) : chalk.green('0')}`);
    console.log(`  Total Findings:  ${scorecard.findingsCount}`);
    console.log();
  }

  private scoreColor(score: number): string {
    if (score >= 80) return chalk.green(String(score));
    if (score >= 60) return chalk.yellow(String(score));
    return chalk.red(String(score));
  }

  // ── Artifact paths ─────────────────────────────────────────────────────────

  artifactPath(label: string, path: string): void {
    console.log(`  ${chalk.cyan('→')} ${chalk.bold(label)}: ${chalk.dim(path)}`);
  }

  artifactList(paths: Array<{ label: string; path: string }>): void {
    console.log(chalk.bold('\n  Artifacts'));
    console.log(chalk.dim('  ' + '─'.repeat(42)));
    for (const { label, path } of paths) {
      this.artifactPath(label, path);
    }
    console.log();
  }

  // ── Error / Warning ────────────────────────────────────────────────────────

  error(message: string): void {
    console.error(chalk.red(`\n  Error: ${message}\n`));
  }

  warning(message: string): void {
    console.warn(chalk.yellow(`\n  Warning: ${message}\n`));
  }

  info(message: string): void {
    console.log(chalk.cyan(`  ℹ  ${message}`));
  }

  dim(message: string): void {
    console.log(chalk.dim(`  ${message}`));
  }

  // ── Doctor ─────────────────────────────────────────────────────────────────

  doctorCheck(name: string, status: 'pass' | 'fail' | 'warn', details?: string): void {
    const icon = status === 'pass' ? chalk.green('✓') : status === 'warn' ? chalk.yellow('⚠') : chalk.red('✗');
    const detail = details ? chalk.dim(` — ${details}`) : '';
    console.log(`  ${icon}  ${name}${detail}`);
  }

  doctorSection(name: string): void {
    console.log(chalk.bold(`\n  ${name}`));
    console.log(chalk.dim('  ' + '─'.repeat(42)));
  }

  // ── Prompt ─────────────────────────────────────────────────────────────────

  prompt(label = 'turpan'): void {
    process.stdout.write(chalk.cyan(label) + chalk.dim(' > '));
  }

  // ── Exit ───────────────────────────────────────────────────────────────────

  goodbye(): void {
    console.log(chalk.dim('\n  👋 Goodbye!\n'));
  }

  // ── Safe mode warning ──────────────────────────────────────────────────────

  safeModeNotice(): void {
    console.log(chalk.dim('\n  ℹ  Running in safe mode — no files will be modified.'));
    console.log(chalk.dim('     Use "fix --apply" to apply fixes.\n'));
  }

  patchModeNotice(): void {
    console.log(chalk.dim('\n  ℹ  Patch-only mode — fixes will be proposed but not applied.\n'));
  }

  applyModeNotice(): void {
    console.log(chalk.yellow('\n  ⚠  Apply mode — fixes will be applied to files.\n'));
  }
}