/**
 * PatchVerifier — validates patches by running project quality checks.
 *
 * Checks run:
 *  - build     → npm/package build script
 *  - typecheck → tsc --noEmit or equivalent
 *  - lint      → project linter (eslint, ruff, etc.)
 *  - test      → project test script
 *  - ui-test   → targeted UI test (if UI finding was fixed)
 *
 * Runs checks in parallel for efficiency.
 * Short-circuits on critical failure (build/typecheck).
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import type {
  ValidationCheck,
  ValidationResult,
  ValidationSummary,
  FixCandidate,
} from './types.js';

export interface VerifyOptions {
  projectRoot: string;
  /** Which checks to run (inferred from candidates if not provided) */
  checks?: ValidationCheck[];
  /** Timeout per check in ms */
  timeoutMs?: number;
  /** Package manager (npm/pnpm/yarn) */
  packageManager?: 'npm' | 'pnpm' | 'yarn';
  /** Custom typecheck command */
  typecheckCmd?: string;
  /** Custom lint command */
  lintCmd?: string;
  /** Custom build command */
  buildCmd?: string;
  /** Custom test command */
  testCmd?: string;
}

interface PackageScripts {
  build?: string;
  typecheck?: string;
  'type-check'?: string;
  lint?: string;
  test?: string;
}

function readPackageScripts(projectRoot: string): PackageScripts {
  try {
    const pkgPath = join(projectRoot, 'package.json');
    if (!existsSync(pkgPath)) return {};
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return (pkg.scripts as PackageScripts) ?? {};
  } catch {
    return {};
  }
}

function execCommand(
  cmd: string,
  cwd: string,
  timeoutMs: number
): { passed: boolean; output: string; error?: string; durationMs: number } {
  const start = Date.now();
  try {
    const output = execSync(cmd, {
      cwd,
      encoding: 'utf-8',
      timeout: timeoutMs,
      stdio: 'pipe',
    });
    return { passed: true, output, durationMs: Date.now() - start };
  } catch (raw: unknown) {
    const error = raw instanceof Error ? raw.message : String(raw);
    const durationMs = Date.now() - start;
    // execSync throws on non-zero exit — capture that output
    let output = '';
    if (typeof raw === 'object' && raw !== null) {
      const oerr = raw as Record<string, unknown>;
      if (oerr.stderr) output = String(oerr.stderr);
      else if (oerr.stdout) output = String(oerr.stdout);
    }
    return { passed: false, output, error, durationMs };
  }
}

async function runCheck(
  check: ValidationCheck,
  opts: VerifyOptions,
  scripts: PackageScripts
): Promise<ValidationResult> {
  const { projectRoot, timeoutMs = 120_000 } = opts;
  const start = Date.now();

  let cmd: string | null = null;
  let label = check;

  switch (check) {
    case 'build':
      cmd =
        opts.buildCmd ??
        (scripts.build ??
          (existsSync(join(projectRoot, 'Makefile')) ? 'make' : null));
      if (!cmd) return { check, passed: true, durationMs: 0, output: 'No build script found' };
      cmd = scripts.build ? `npm run build` : 'make build';
      break;

    case 'typecheck':
      cmd =
        opts.typecheckCmd ??
        (scripts.typecheck ??
          scripts['type-check'] ??
          (existsSync(join(projectRoot, 'tsconfig.json')) ? 'tsc --noEmit' : null));
      if (!cmd) return { check, passed: true, durationMs: 0, output: 'No typecheck script found' };
      if (cmd.startsWith('tsc')) {
        const pm = opts.packageManager ?? 'npm';
        cmd = `${pm} run typecheck 2>/dev/null || ${cmd}`;
      }
      break;

    case 'lint':
      cmd =
        opts.lintCmd ??
        (scripts.lint ??
          (existsSync(join(projectRoot, '.eslintrc.js')) ||
          existsSync(join(projectRoot, '.eslintrc.cjs')) ||
          existsSync(join(projectRoot, '.eslintrc.json'))
            ? 'eslint . --max-warnings 0'
            : null));
      if (!cmd) return { check, passed: true, durationMs: 0, output: 'No lint script found' };
      if (!cmd.includes(' ')) {
        const pm = opts.packageManager ?? 'npm';
        cmd = `${pm} run lint 2>/dev/null || ${cmd}`;
      }
      break;

    case 'test':
      cmd =
        opts.testCmd ??
        (scripts.test ??
          (existsSync(join(projectRoot, 'pytest.ini')) ? 'pytest -q' : null));
      if (!cmd) return { check, passed: true, durationMs: 0, output: 'No test script found' };
      if (!cmd.includes(' ')) {
        const pm = opts.packageManager ?? 'npm';
        cmd = `${pm} run test 2>/dev/null || ${cmd}`;
      }
      break;

    case 'ui-test':
      // Targeted UI test: run only if UI findings were fixed
      // For now, skip as it requires BrowserSession — caller should handle this
      return { check, passed: true, durationMs: 0, output: 'UI test check delegated to caller' };
  }

  if (!cmd) return { check, passed: true, durationMs: 0, output: `No command for ${check}` };

  try {
    const result = execCommand(cmd, projectRoot, timeoutMs);
    return {
      check,
      passed: result.passed,
      durationMs: result.durationMs,
      output: result.output.slice(0, 5000),
      error: result.error?.slice(0, 1000),
    };
  } catch (err: unknown) {
    return {
      check,
      passed: false,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
    };
  }
}

/**
 * Run all required validation checks.
 * Runs non-blocking checks in parallel; blocks on build/typecheck results.
 */
export async function verifyPatch(
  candidates: FixCandidate[],
  opts: VerifyOptions
): Promise<ValidationSummary> {
  const { checks = ['build', 'typecheck', 'lint', 'test'], projectRoot } = opts;

  const scripts = readPackageScripts(projectRoot);

  // Filter checks to only those applicable to this project
  const applicableChecks = checks.filter(check => {
    if (check === 'ui-test') return false; // always delegated
    if (check === 'build' && !scripts.build) return false;
    if (check === 'typecheck' && !scripts.typecheck && !scripts['type-check'] && !existsSync(join(projectRoot, 'tsconfig.json'))) return false;
    if (check === 'lint' && !scripts.lint && !existsSync(join(projectRoot, '.eslintrc.js'))) return false;
    if (check === 'test' && !scripts.test) return false;
    return true;
  });

  // Separate blocking checks from parallel ones
  // build and typecheck are blocking (must pass or rollback)
  // lint and test are non-blocking (warnings are ok)
  const blocking = applicableChecks.filter(c => c === 'build' || c === 'typecheck');
  const nonBlocking = applicableChecks.filter(c => c !== 'build' && c !== 'typecheck');

  const results: ValidationResult[] = [];
  const start = Date.now();

  // Run blocking checks first (sequentially for clarity)
  for (const check of blocking) {
    const result = await runCheck(check, opts, scripts);
    results.push(result);
    // Stop on blocking failure
    if (!result.passed) {
      return {
        allPassed: false,
        results,
        totalDurationMs: Date.now() - start,
      };
    }
  }

  // Run non-blocking checks in parallel
  if (nonBlocking.length > 0) {
    const parallelResults = await Promise.all(
      nonBlocking.map(check => runCheck(check, opts, scripts))
    );
    results.push(...parallelResults);
  }

  const allPassed = results.every(r => r.passed);

  return {
    allPassed,
    results,
    totalDurationMs: Date.now() - start,
  };
}

/**
 * Should we rollback given a validation failure?
 * Only rollback on blocking check failures (build, typecheck).
 */
export function shouldRollback(summary: ValidationSummary): boolean {
  return !summary.allPassed && summary.results.some(
    r => !r.passed && (r.check === 'build' || r.check === 'typecheck')
  );
}
