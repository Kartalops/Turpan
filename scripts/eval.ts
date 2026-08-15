#!/usr/bin/env node
/**
 * Turpan Eval Runner v2
 *
 * Runs Turpan against every fixture in examples/fixtures/ and asserts that
 * the resulting findings match the expectations in each fixture's eval.json.
 *
 * Assertion schema supports:
 *   - verdict: expected verdict(s)
 *   - criticalFindings / highFindings / totalFindings: count assertions
 *   - mustDetect: substrings that must appear in finding titles (soft → warning by default)
 *   - mustNotDetect: substrings that must NOT appear (always hard error)
 *   - mustIncludeFile: file paths that must appear in finding file references
 *   - mustIncludeCategory: categories that must appear in findings
 *   - categories: category-level min/max count assertions
 *   - severityCount: exact per-severity counts
 *   - mode: 'hard' (warnings become errors) | 'soft' (default, warnings stay warnings)
 *
 * Usage:
 *   pnpm eval                       # Run all fixtures
 *   pnpm eval --fixture name        # Run a specific fixture
 *   pnpm eval --update              # Update eval.json with actual results
 *   pnpm eval --verbose             # Show full Turpan output per fixture
 *   pnpm eval --hard-fail           # Treat all warnings as errors (CI mode)
 *   node scripts/eval.ts --turpan-cli  # Use installed turpan CLI instead of dist
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, rmSync, mkdirSync, statSync } from 'fs';
import { join, resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync, execSync as _execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const FIXTURES_DIR = join(REPO_ROOT, 'examples', 'fixtures');
const CLI_DIST = join(REPO_ROOT, 'apps', 'cli', 'dist', 'index.js');
const CLI_SRC  = join(REPO_ROOT, 'apps', 'cli', 'src', 'index.ts');

// ─── Assertion Schema ────────────────────────────────────────────────────────

interface CountAssertion {
  min?: number;
  max?: number;
}

interface SeverityCount {
  critical?: number;
  high?: number;
  medium?: number;
  low?: number;
}

interface ExpectedResult {
  /** Mode: 'hard' = warnings become errors, 'soft' = default behavior */
  mode?: 'hard' | 'soft';
  /** Expected verdict(s) */
  verdict?: string[];
  /** Critical findings count assertion */
  criticalFindings?: number | CountAssertion;
  /** High findings count assertion */
  highFindings?: number | CountAssertion;
  /** Total findings count assertion */
  totalFindings?: number | CountAssertion;
  /** Substrings that must appear in at least one finding title (soft → warning) */
  mustDetect?: string[];
  /** Substrings that must NOT appear in any finding title (hard error) */
  mustNotDetect?: string[];
  /** File paths that at least one finding must reference */
  mustIncludeFile?: string[];
  /** Finding categories that must appear in results */
  mustIncludeCategory?: string[];
  /** Per-category count assertions */
  categories?: Record<string, CountAssertion>;
  /** Exact per-severity counts */
  severityCount?: SeverityCount;
}

interface EvalJson {
  fixture: string;
  description?: string;
  /** Human-readable tags for this fixture */
  tags?: string[];
  expected: ExpectedResult;
}

// ─── Result Types ────────────────────────────────────────────────────────────

interface Finding {
  severity: string;
  category: string;
  title: string;
  file?: string;
}

interface ActualResults {
  verdict: string;
  findingsCount: number;
  criticalFindings: number;
  highFindings: number;
  mediumFindings: number;
  lowFindings: number;
  findingsByCategory: Record<string, number>;
  findingTitles: string[];
  findingFiles: string[];
  stageResults: Record<string, string>;
}

interface AssertionResult {
  assertion: string;
  type: string;
  passed: boolean;
  expected?: string;
  actual?: string;
  severity: 'error' | 'warning';
}

interface FixtureResult {
  fixture: string;
  description: string;
  tags: string[];
  mode: 'hard' | 'soft';
  passed: boolean;
  verdict: 'PASS' | 'WARN' | 'FAIL';
  errors: string[];
  warnings: string[];
  assertions: AssertionResult[];
  actual: ActualResults;
  durationMs: number;
}

// ─── CLI Flags ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flags = {
  fixture: args.includes('--fixture') ? args[args.indexOf('--fixture') + 1] : null,
  update: args.includes('--update'),
  verbose: args.includes('--verbose'),
  quiet: args.includes('--quiet'),
  hardFail: args.includes('--hard-fail'),
  skipInstall: args.includes('--skip-install'),
  useSystemCli: args.includes('--turpan-cli'),
  reportPath: args.includes('--report') ? args[args.indexOf('--report') + 1] : null,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function findCli(): string {
  if (flags.useSystemCli) {
    const systemCli = 'turpan';
    try {
      _execSync(systemCli, { encoding: 'utf-8' });
    } catch {
      throw new Error('`turpan` not found in PATH. Install Turpan or use --dist flag.');
    }
    return systemCli;
  }
  // The source tree uses ESM .js specifiers that Node's strip-types loader
  // cannot resolve. Prefer the production build that users actually execute.
  if (existsSync(CLI_DIST)) {
    return `node ${CLI_DIST}`;
  }
  // Development fallback: tsx resolves TypeScript source and its ESM imports.
  if (existsSync(CLI_SRC)) return `pnpm exec tsx ${CLI_SRC}`;
  throw new Error(`CLI not found at ${CLI_SRC} or ${CLI_DIST}. Run 'pnpm build' first.`);
}

function loadFixtures(): EvalJson[] {
  if (!existsSync(FIXTURES_DIR)) {
    throw new Error(`Fixtures directory not found: ${FIXTURES_DIR}`);
  }
  const fixtures: EvalJson[] = [];
  const entries = readdirSync(FIXTURES_DIR);

  for (const entry of entries) {
    const fullPath = join(FIXTURES_DIR, entry);
    if (!statSync(fullPath).isDirectory()) continue;
    if (flags.fixture && entry !== flags.fixture) continue;

    const evalJsonPath = join(fullPath, 'eval.json');
    if (!existsSync(evalJsonPath)) {
      if (!flags.quiet) console.warn(`⚠  Skipping ${entry}: no eval.json`);
      continue;
    }
    try {
      const evalJson = JSON.parse(readFileSync(evalJsonPath, 'utf-8')) as EvalJson;
      fixtures.push(evalJson);
    } catch (err) {
      console.error(`✗  Failed to parse ${evalJsonPath}:`, err);
    }
  }
  return fixtures;
}

// ─── Core Running ────────────────────────────────────────────────────────────

function runFixture(cli: string, fixture: EvalJson): FixtureResult {
  const fixtureDir = join(FIXTURES_DIR, fixture.fixture);
  const runDir = join(REPO_ROOT, '.turpan', 'evals', fixture.fixture);

  // Clean stale run
  if (existsSync(runDir)) {
    rmSync(runDir, { recursive: true, force: true });
  }
  mkdirSync(runDir, { recursive: true });

  const start = Date.now();

  // Build the turpan review command
  // Use --deep and let plugins auto-detect so all applicable plugins run
  // (python, next, saas, mcp, security-basic, etc.)
  const cmd = [
    cli,
    'review',
    fixtureDir,
    '--deep',
    '--skip-build',
    '--skip-tests',
    '--skip-lint',
    '--skip-typecheck',
    '--timeout', '60',
  ];

  if (flags.verbose) {
    console.log(`\n>>> Running: ${cmd.join(' ')}`);
  }

  const result = spawnSync(cmd[0], cmd.slice(1), {
    cwd: fixtureDir,
    encoding: 'utf-8',
    timeout: 120_000,
    shell: true,
  });

  const durationMs = Date.now() - start;

  // Parse findings from the fixture's .turpan/runs/latest/
  const fixtureRunDir = join(fixtureDir, '.turpan', 'runs', 'latest');
  const findingsPath = join(fixtureRunDir, 'TURPAN_FINDINGS.json');

  let findings: Finding[] = [];
  if (existsSync(findingsPath)) {
    try {
      const data = JSON.parse(readFileSync(findingsPath, 'utf-8'));
      findings = data.findings ?? [];
    } catch { /* ignore */ }
  }

  // Count by severity
  const criticalCount = findings.filter(f => f.severity === 'critical').length;
  const highCount = findings.filter(f => f.severity === 'high').length;
  const mediumCount = findings.filter(f => f.severity === 'medium').length;
  const lowCount = findings.filter(f => f.severity === 'low').length;

  // Derive verdict
  let verdict = 'GO';
  if (criticalCount > 0) verdict = 'NO_GO';
  else if (highCount > 0) verdict = 'CONDITIONAL_GO';
  else if (findings.length > 5) verdict = 'CONDITIONAL_GO';

  const findingsByCategory: Record<string, number> = {};
  for (const f of findings) {
    findingsByCategory[f.category] = (findingsByCategory[f.category] ?? 0) + 1;
  }

  return {
    fixture: fixture.fixture,
    description: fixture.description ?? '',
    tags: fixture.tags ?? [],
    mode: fixture.expected.mode ?? 'soft',
    passed: false,
    verdict: 'PASS',
    errors: [],
    warnings: [],
    assertions: [],
    actual: {
      verdict,
      findingsCount: findings.length,
      criticalFindings: criticalCount,
      highFindings: highCount,
      mediumFindings: mediumCount,
      lowFindings: lowCount,
      findingsByCategory,
      findingTitles: findings.map(f => f.title.toLowerCase()),
      findingFiles: findings.map(f => (f.file ?? '').toLowerCase()),
      stageResults: {},
    },
    durationMs,
  };
}

// ─── Evaluation ─────────────────────────────────────────────────────────────

function countAssertion(exp: number | CountAssertion | undefined, actual: number): { pass: boolean; errors: string[] } {
  if (exp === undefined) return { pass: true, errors: [] };
  if (typeof exp === 'number') {
    if (actual === exp) return { pass: true, errors: [] };
    return { pass: false, errors: [`expected exactly ${exp}, got ${actual}`] };
  }
  const errors: string[] = [];
  if (exp.min !== undefined && actual < exp.min) errors.push(`expected at least ${exp.min}, got ${actual}`);
  if (exp.max !== undefined && actual > exp.max) errors.push(`expected at most ${exp.max}, got ${actual}`);
  return { pass: errors.length === 0, errors };
}

function evaluate(fixture: EvalJson, result: FixtureResult): void {
  const { expected } = fixture;
  const assertions: AssertionResult[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  const isHardMode = flags.hardFail || fixture.expected.mode === 'hard';

  // ── Verdict ──────────────────────────────────────────────────────────────
  if (expected.verdict && expected.verdict.length > 0) {
    const pass = expected.verdict.includes(result.actual.verdict);
    assertions.push({
      assertion: `verdict ∈ [${expected.verdict.join(', ')}]`,
      type: 'verdict',
      passed: pass,
      expected: expected.verdict.join(' | '),
      actual: result.actual.verdict,
      severity: 'error',
    });
    if (!pass) errors.push(`verdict: expected ${expected.verdict.join(' or ')}, got ${result.actual.verdict}`);
  }

  // ── Counts ──────────────────────────────────────────────────────────────
  for (const [label, exp, actual] of [
    ['criticalFindings', expected.criticalFindings, result.actual.criticalFindings],
    ['highFindings',     expected.highFindings,     result.actual.highFindings],
    ['totalFindings',    expected.totalFindings,    result.actual.findingsCount],
  ] as [string, number | CountAssertion | undefined, number][]) {
    const { pass, errors: errs } = countAssertion(exp, actual);
    assertions.push({
      assertion: label,
      type: 'count',
      passed: pass,
      expected: typeof exp === 'object' ? JSON.stringify(exp) : String(exp),
      actual: String(actual),
      severity: 'error',
    });
    errors.push(...errs.map(e => `${label}: ${e}`));
  }

  // ── Severity count (exact per-severity) ──────────────────────────────────
  if (expected.severityCount) {
    for (const [sev, exp] of Object.entries(expected.severityCount)) {
      const actual = [result.actual.criticalFindings, result.actual.highFindings, result.actual.mediumFindings, result.actual.lowFindings][
        ['critical', 'high', 'medium', 'low'].indexOf(sev)
      ] ?? 0;
      const pass = actual === exp;
      assertions.push({
        assertion: `severityCount.${sev}`,
        type: 'severityCount',
        passed: pass,
        expected: String(exp),
        actual: String(actual),
        severity: 'error',
      });
      if (!pass) errors.push(`severityCount.${sev}: expected ${exp}, got ${actual}`);
    }
  }

  // ── Categories ───────────────────────────────────────────────────────────
  if (expected.categories) {
    for (const [cat, exp] of Object.entries(expected.categories)) {
      const actual = result.actual.findingsByCategory[cat] ?? 0;
      const { pass, errors: errs } = countAssertion(exp, actual);
      assertions.push({
        assertion: `categories.${cat}`,
        type: 'category',
        passed: pass,
        expected: typeof exp === 'object' ? JSON.stringify(exp) : String(exp),
        actual: String(actual),
        severity: 'error',
      });
      errors.push(...errs.map(e => `category ${cat}: ${e}`));
    }
  }

  // ── mustIncludeCategory ─────────────────────────────────────────────────
  if (expected.mustIncludeCategory && expected.mustIncludeCategory.length > 0) {
    const categories = Object.keys(result.actual.findingsByCategory).map(c => c.toLowerCase());
    for (const cat of expected.mustIncludeCategory) {
      const found = categories.includes(cat.toLowerCase());
      assertions.push({
        assertion: `mustIncludeCategory:${cat}`,
        type: 'mustIncludeCategory',
        passed: found,
        expected: `category "${cat}" present`,
        actual: found ? 'found' : 'NOT FOUND',
        severity: isHardMode ? 'error' : 'warning',
      });
      if (!found) {
        const msg = `mustIncludeCategory: no finding with category "${cat}"`;
        if (isHardMode) errors.push(msg); else warnings.push(msg);
      }
    }
  }

  // ── mustIncludeFile ──────────────────────────────────────────────────────
  if (expected.mustIncludeFile && expected.mustIncludeFile.length > 0) {
    const files = result.actual.findingFiles;
    for (const file of expected.mustIncludeFile) {
      const found = files.some(f => f.includes(file.toLowerCase()));
      assertions.push({
        assertion: `mustIncludeFile:${file}`,
        type: 'mustIncludeFile',
        passed: found,
        expected: `file "${file}" referenced`,
        actual: found ? 'found' : 'NOT FOUND',
        severity: isHardMode ? 'error' : 'warning',
      });
      if (!found) {
        const msg = `mustIncludeFile: no finding references "${file}"`;
        if (isHardMode) errors.push(msg); else warnings.push(msg);
      }
    }
  }

  // ── mustDetect (soft → warning, hard mode → error) ───────────────────────
  if (expected.mustDetect && expected.mustDetect.length > 0) {
    const titles = result.actual.findingTitles.join(' ');
    for (const needle of expected.mustDetect) {
      const found = titles.includes(needle.toLowerCase());
      assertions.push({
        assertion: `mustDetect:"${needle}"`,
        type: 'mustDetect',
        passed: found,
        expected: `title containing "${needle}"`,
        actual: found ? 'found' : 'NOT FOUND',
        severity: isHardMode ? 'error' : 'warning',
      });
      if (!found) {
        const msg = `mustDetect: no finding title contained '${needle}'`;
        if (isHardMode) errors.push(msg); else warnings.push(msg);
      }
    }
  }

  // ── mustNotDetect (always hard error) ────────────────────────────────────
  if (expected.mustNotDetect && expected.mustNotDetect.length > 0) {
    const titles = result.actual.findingTitles.join(' ');
    for (const needle of expected.mustNotDetect) {
      const found = titles.includes(needle.toLowerCase());
      assertions.push({
        assertion: `mustNotDetect:"${needle}"`,
        type: 'mustNotDetect',
        passed: !found,
        expected: `title NOT containing "${needle}"`,
        actual: found ? `FOUND "${needle}"` : 'not found',
        severity: 'error',
      });
      if (found) errors.push(`mustNotDetect: a finding title contained '${needle}'`);
    }
  }

  result.assertions = assertions;
  result.errors = errors;
  result.warnings = warnings;

  // Verdict: FAIL if errors, WARN if only warnings, PASS if nothing wrong
  if (errors.length > 0) result.verdict = 'FAIL';
  else if (warnings.length > 0) result.verdict = 'WARN';
  else result.verdict = 'PASS';

  result.passed = errors.length === 0;
}

// ─── Update Mode ────────────────────────────────────────────────────────────

function updateFixture(fixture: EvalJson, result: FixtureResult): void {
  const evalJsonPath = join(FIXTURES_DIR, fixture.fixture, 'eval.json');
  const updated = {
    ...fixture,
    description: fixture.description ?? result.description,
    tags: fixture.tags ?? [],
    expected: {
      ...fixture.expected,
      verdict: fixture.expected.verdict ?? [result.actual.verdict],
      // Update counts to match actual
      criticalFindings: typeof fixture.expected.criticalFindings === 'object'
        ? fixture.expected.criticalFindings
        : result.actual.criticalFindings,
      highFindings: typeof fixture.expected.highFindings === 'object'
        ? fixture.expected.highFindings
        : result.actual.highFindings,
      totalFindings: typeof fixture.expected.totalFindings === 'object'
        ? fixture.expected.totalFindings
        : result.actual.findingsCount,
    },
  };
  writeFileSync(evalJsonPath, JSON.stringify(updated, null, 2), 'utf-8');
  console.log(`  🔄 Updated ${fixture.fixture}/eval.json`);
}

// ─── Reporting ──────────────────────────────────────────────────────────────

function printResults(results: FixtureResult[]): void {
  console.log('\n' + '='.repeat(72));
  console.log('  Turpan Eval Results v2');
  console.log('='.repeat(72) + '\n');

  let pass = 0, warn = 0, fail = 0;

  for (const r of results) {
    if (r.verdict === 'PASS') pass++;
    else if (r.verdict === 'WARN') warn++;
    else fail++;

    const icon = r.verdict === 'PASS' ? '✅' : r.verdict === 'WARN' ? '⚠️ ' : '❌';
    const mode = r.mode === 'hard' ? '[HARD] ' : '';
    console.log(`${icon} ${mode}${r.fixture}  (${r.durationMs}ms)`);
    console.log(`   ${r.description}`);
    if (r.tags.length > 0) console.log(`   Tags: ${r.tags.join(', ')}`);
    console.log(`   Verdict: ${r.actual.verdict} | Findings: ${r.actual.findingsCount} `
      + `(${r.actual.criticalFindings}🔴 ${r.actual.highFindings}🟠 ${r.actual.mediumFindings}🟡 ${r.actual.lowFindings}🔵)`);

    const cats = Object.entries(r.actual.findingsByCategory);
    if (cats.length > 0) {
      const catStr = cats.map(([k, v]) => `${k}=${v}`).join(', ');
      console.log(`   Categories: ${catStr}`);
    }

    if (r.errors.length > 0) {
      console.log('   Errors:');
      for (const e of r.errors) console.log(`     ✗ ${e}`);
    }
    if (r.warnings.length > 0) {
      console.log('   Warnings:');
      for (const w of r.warnings) console.log(`     ⚠ ${w}`);
    }
    if (r.assertions.length > 0 && flags.verbose) {
      console.log('   Assertions:');
      for (const a of r.assertions) {
        const mark = a.passed ? '✓' : a.severity === 'error' ? '✗' : '⚠';
        console.log(`     ${mark} ${a.assertion} (${a.type}): ${a.passed ? 'PASS' : 'FAIL'} | expected=${a.expected} actual=${a.actual}`);
      }
    }
    console.log();
  }

  console.log('─'.repeat(72));
  console.log(`  Summary: ${results.length} fixtures | `
    + `✅ PASS: ${pass} | ⚠️  WARN: ${warn} | ❌ FAIL: ${fail}`);
  console.log('─'.repeat(72) + '\n');
}

function saveReport(results: FixtureResult[]): void {
  const reportDir = join(REPO_ROOT, '.turpan', 'evals');
  mkdirSync(reportDir, { recursive: true });
  const reportPath = flags.reportPath ?? join(reportDir, 'eval-report.json');

  const totalMs = results.reduce((sum, r) => sum + r.durationMs, 0);

  const report = {
    timestamp: new Date().toISOString(),
    version: '2.0',
    total: results.length,
    passed: results.filter(r => r.verdict === 'PASS').length,
    warned: results.filter(r => r.verdict === 'WARN').length,
    failed: results.filter(r => r.verdict === 'FAIL').length,
    totalDurationMs: totalMs,
    hardFailMode: flags.hardFail,
    results: results.map(r => ({
      fixture: r.fixture,
      description: r.description,
      tags: r.tags,
      mode: r.mode,
      verdict: r.verdict,
      passed: r.passed,
      durationMs: r.durationMs,
      actual: {
        verdict: r.actual.verdict,
        findingsCount: r.actual.findingsCount,
        criticalFindings: r.actual.criticalFindings,
        highFindings: r.actual.highFindings,
        mediumFindings: r.actual.mediumFindings,
        lowFindings: r.actual.lowFindings,
        findingsByCategory: r.actual.findingsByCategory,
        findingTitles: r.actual.findingTitles,
      },
      matchedAssertions: r.assertions.filter(a => a.passed).map(a => a.assertion),
      missingAssertions: r.assertions.filter(a => !a.passed && a.severity === 'error').map(a => a.assertion),
      falsePositives: r.warnings, // warnings that could be FP
      errors: r.errors,
      warnings: r.warnings,
    })),
  };

  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`📄  Report saved: ${reportPath}\n`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main(): void {
  console.log('🐪  Turpan Eval Runner v2');
  console.log(`    Repo: ${REPO_ROOT}`);
  console.log(`    Fixtures: ${FIXTURES_DIR}`);
  if (flags.hardFail) console.log(`    Mode: HARD FAIL (warnings → errors)\n`);
  else console.log();

  const cli = findCli();
  const fixtures = loadFixtures();

  if (fixtures.length === 0) {
    console.error('✗  No fixtures found.');
    process.exit(1);
  }

  console.log(`📋  Found ${fixtures.length} fixture(s):\n`);
  for (const f of fixtures) {
    const mode = f.expected.mode === 'hard' ? ' [HARD]' : '';
    console.log(`   • ${f.fixture}${mode} — ${f.description ?? '(no description)'}`);
  }
  console.log();

  const results: FixtureResult[] = [];
  for (const fixture of fixtures) {
    if (!flags.quiet) {
      const mode = fixture.expected.mode === 'hard' ? ' [HARD]' : '';
      console.log(`▶  Running ${fixture.fixture}${mode}…`);
    }

    const result = runFixture(cli, fixture);
    evaluate(fixture, result);

    if (flags.update) {
      updateFixture(fixture, result);
    }

    results.push(result);

    if (!flags.quiet) {
      const icon = result.verdict === 'PASS' ? '✅' : result.verdict === 'WARN' ? '⚠️ ' : '❌';
      console.log(`   ${icon} ${result.errors.length} error(s), ${result.warnings.length} warning(s), `
        + `${result.assertions.filter(a => a.passed).length}/${result.assertions.length} assertions passed\n`);
    }
  }

  printResults(results);
  saveReport(results);

  const failed = results.filter(r => r.verdict === 'FAIL').length;
  process.exit(failed > 0 ? 1 : 0);
}

main();
