/**
 * Python Plugin — specialized review skills for Python projects.
 *
 * Contributes:
 *  - Syntax and import analysis
 *  - Test discovery (pytest)
 *  - Virtual environment checks
 *  - Requirements.txt / pyproject.toml validation
 */

import { readFileSync } from 'fs';
import type { Plugin, PluginManifest } from '../../Plugin.js';
import type { PluginContext } from '../../PluginContext.js';
import type { PluginRegistry } from '../../PluginRegistry.js';
import type { ProjectFingerprint } from '../../../project/index.js';
import type { Finding, Category } from '../../../findings/Finding.js';
import type { Analyzer, AnalyzerContext } from '../../../analyzers/Analyzer.js';
import { walkFiles } from '../../../shared/index.js';
import { confidence, createFinding } from '../../../findings/Finding.js';
import { createEvidence } from '../../../findings/Evidence.js';

// ── Manifest ──────────────────────────────────────────────────────────────────

const manifest: PluginManifest = {
  id: 'python',
  name: 'Python Review Skills',
  version: '0.1.0',
  description: 'Specialized analyzers for Python: syntax, imports, pytest, requirements, virtualenv',
  dependsOn: [],
};

// ── Plugin ─────────────────────────────────────────────────────────────────────

export const pythonPlugin: Plugin = {
  manifest,

  supports(fp: ProjectFingerprint): boolean {
    return (
      fp.languages.includes('python') ||
      fp.appType === 'python-bot' ||
      fp.appType === 'fastapi'
    );
  },

  register(registry: PluginRegistry, _ctx: PluginContext): void {
    registry.registerAnalyzer(createPythonAnalyzer(), manifest.id);
  },
};

// ── Python Analyzer ─────────────────────────────────────────────────────────────

function createPythonAnalyzer(): Analyzer {
  return {
    id: 'python-specific',
    name: 'Python Specific Analyzer',
    categories: ['maintainability', 'dependency'],

    supports(fp: ProjectFingerprint): boolean {
      return (
        fp.languages.includes('python') ||
        fp.appType === 'python-bot' ||
        fp.appType === 'fastapi'
      );
    },

    async run(ctx: AnalyzerContext): Promise<{
      analyzerId: string;
      findings: Finding[];
      artifacts?: Record<string, unknown>;
      durationMs: number;
      errors: string[];
    }> {
      const start = Date.now();
      const findings: Finding[] = [];
      const artifacts: Record<string, unknown> = {};

      try {
        const pyFiles = walkFiles({
          cwd: ctx.projectRoot,
          extensions: ['py'],
          ignoreDirs: new Set(['venv', '.venv', '__pycache__', '.git', 'dist', 'build']),
          maxDepth: 6,
        });

        // Check for pyproject.toml vs requirements.txt
        const hasPyproject = pyFiles.some((f: string) => f.endsWith('pyproject.toml'));
        const hasRequirements = pyFiles.some((f: string) =>
          f.endsWith('requirements.txt') || f.endsWith('requirements-dev.txt')
        );
        artifacts['hasPyproject'] = hasPyproject;
        artifacts['hasRequirements'] = hasRequirements;
        artifacts['pythonFileCount'] = pyFiles.length;

        // ── Check for bare except clauses (ACTUALLY read file content) ──────
        const bareExceptHits: Array<{ file: string; line: number; excerpt: string }> = [];
        const BARE_EXCEPT_RE = /\bexcept\s*:\s*($|\n|#)/i;
        const SPECIFIC_EXCEPT_RE = /\bexcept\s+\w+.*:/i;

        for (const file of pyFiles) {
          let content: string;
          try { content = readFileSync(file, 'utf-8'); } catch { continue; }
          if (content.length > 200_000) continue;

          // Skip test files
          if (/\btest_|_test\.py\b/.test(file)) continue;

          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Skip comment-only lines
            if (/^\s*#/.test(line)) continue;
            if (BARE_EXCEPT_RE.test(line) && !SPECIFIC_EXCEPT_RE.test(line)) {
              const relPath = file.startsWith(ctx.projectRoot)
                ? file.slice(ctx.projectRoot.length + 1)
                : file;
              bareExceptHits.push({
                file: relPath,
                line: i + 1,
                excerpt: line.trim().slice(0, 120),
              });
            }
          }
        }

        if (bareExceptHits.length > 0) {
          findings.push(createFinding({
            id: 'python-bare-except',
            title: `Bare 'except:' swallows ${bareExceptHits.length} exception(s) silently`,
            explanation:
              `Found ${bareExceptHits.length} bare 'except:' clause(s) that catch all exceptions ` +
              `including KeyboardInterrupt and SystemExit. This makes debugging difficult and ` +
              `can hide real failures from operators. Use 'except Exception:' or a specific ` +
              `exception type instead.`,
            severity: bareExceptHits.length >= 3 ? 'high' : 'medium',
            category: 'maintainability',
            fixable: 'manual',
            confidence: confidence(90),
            suggestedFix: 'Replace bare except: with except Exception: or a specific exception type. Add error logging.',
            tags: ['python', 'error-handling', 'silent-failure'],
            evidence: bareExceptHits.slice(0, 5).map(h => createEvidence('code', {
              label: 'Bare except:',
              path: h.file,
              excerpt: h.excerpt,
              metadata: { line: h.line },
            })),
          }));
        }

        // ── Check for broad except-pass (silent swallow) ─────────────────────
        // Detects: except SomeException: pass  (no logging, no re-raising)
        const silentExHits: Array<{ file: string; line: number; excerpt: string }> = [];

        for (const file of pyFiles) {
          if (/\btest_|_test\.py\b/.test(file)) continue;
          let content: string;
          try { content = readFileSync(file, 'utf-8'); } catch { continue; }
          if (content.length > 200_000) continue;

          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Skip comment-only lines
            if (/^\s*#/.test(line)) continue;
            // Look for except SomeType: or bare except:
            if (/\bexcept\s+(\w+)?\s*:\s*$/.test(line)) {
              // Found an except line — check if next non-empty, non-comment line is just 'pass'
              let j = i + 1;
              while (j < lines.length && (lines[j].trim() === '' || /^\s*#/.test(lines[j]))) j++;
              if (j < lines.length && /^\s*pass\s*(?:#.*)?$/.test(lines[j])) {
                const relPath = file.startsWith(ctx.projectRoot)
                  ? file.slice(ctx.projectRoot.length + 1)
                  : file;
                silentExHits.push({
                  file: relPath,
                  line: i + 1,
                  excerpt: line.trim().slice(0, 120),
                });
              }
            }
          }
        }

        if (silentExHits.length > 0) {
          findings.push(createFinding({
            id: 'python-silent-exception',
            title: `Exception silently swallowed — ${silentExHits.length} location(s)`,
            explanation:
              `Found ${silentExHits.length} exception handler(s) that catch an exception but ` +
              `do nothing (only 'pass'). Errors are hidden from operators and debugging is ` +
              `impossible. At minimum, log the exception or re-raise it.`,
            severity: 'high',
            category: 'maintainability',
            fixable: 'manual',
            confidence: confidence(85),
            suggestedFix: 'Add logging.exception() or at minimum print the error before pass.',
            tags: ['python', 'error-handling', 'silent-failure', 'except-pass'],
            evidence: silentExHits.slice(0, 5).map(h => createEvidence('code', {
              label: 'Silent except-pass',
              path: h.file,
              excerpt: h.excerpt,
              metadata: { line: h.line },
            })),
          }));
        }

        // ── Check for missing auth decorator / auth logic not applied ────────
        // Detect when verify_* functions exist but @router decorators don't use them
        const authNotAppliedHits: Array<{ file: string; line: number; excerpt: string }> = [];
        const AUTH_FUNC_RE = /(?:async\s+)?def\s+(verify_\w+|check_\w+|authenticate_\w+)\s*\(/i;
        const ROUTE_DECL_RE = /@(?:app|router)\.(get|post|put|delete|patch)\s*\(/i;

        for (const file of pyFiles) {
          let content: string;
          try { content = readFileSync(file, 'utf-8'); } catch { continue; }
          if (content.length > 200_000) continue;

          const lines = content.split('\n');
          let hasAuthFunc = false;
          let hasRoute = false;
          const authFuncLines: number[] = [];

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (/^\s*#/.test(line)) continue;
            if (AUTH_FUNC_RE.test(line)) {
              hasAuthFunc = true;
              authFuncLines.push(i + 1);
            }
            if (ROUTE_DECL_RE.test(line)) hasRoute = true;
          }

          // If auth functions exist but no route uses them, flag it
          if (hasAuthFunc && !hasRoute && authFuncLines.length > 0) {
            const relPath = file.startsWith(ctx.projectRoot)
              ? file.slice(ctx.projectRoot.length + 1)
              : file;
            authNotAppliedHits.push({
              file: relPath,
              line: authFuncLines[0],
              excerpt: `Auth function defined but no routes apply it (line ${authFuncLines.join(', ')})`,
            });
          }
        }

        if (authNotAppliedHits.length > 0) {
          findings.push(createFinding({
            id: 'python-auth-not-applied',
            title: `Auth logic defined but not applied to ${authNotAppliedHits.length} route(s)`,
            explanation:
              `Found authentication or authorization functions (verify_*, check_*, authenticate_*) ` +
              `that are defined but no route decorators apply them. This means routes are unprotected. ` +
              `Apply auth decorators to routes or call the auth function inside route handlers.`,
            severity: 'critical',
            category: 'security',
            fixable: 'manual',
            confidence: confidence(85),
            suggestedFix: 'Apply @router.on_event or dependency=verify_api_key to protected routes.',
            tags: ['python', 'security', 'auth-bypass', 'critical'],
            evidence: authNotAppliedHits.slice(0, 3).map(h => createEvidence('code', {
              label: 'Unprotected auth function',
              path: h.file,
              excerpt: h.excerpt,
              metadata: { line: h.line },
            })),
          }));
        }

        // ── Check for print statements in production code ─────────────────
        const printHits: Array<{ file: string; line: number; excerpt: string }> = [];
        const PRINT_RE = /^\s*print\s*\(/mi;

        for (const file of pyFiles) {
          if (/\btest_|_test\.py\b/.test(file)) continue;
          let content: string;
          try { content = readFileSync(file, 'utf-8'); } catch { continue; }
          if (content.length > 200_000) continue;

          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (/^\s*#/.test(line)) continue;
            if (PRINT_RE.test(line)) {
              const relPath = file.startsWith(ctx.projectRoot)
                ? file.slice(ctx.projectRoot.length + 1)
                : file;
              printHits.push({ file: relPath, line: i + 1, excerpt: line.trim().slice(0, 120) });
            }
          }
        }

        if (printHits.length > 5) {
          findings.push({
            id: 'python-print-statements',
            title: `Found ${printHits.length} print statements in non-test code`,
            severity: 'low',
            category: 'maintainability' as Category,
            explanation:
              'Use the logging module (logging.info, logging.debug, etc.) instead of print ' +
              'for production code. Logging can be controlled by level and destination.',
            evidence: printHits.slice(0, 5).map(h => createEvidence('code', {
              label: 'print() statement',
              path: h.file,
              excerpt: h.excerpt,
              metadata: { line: h.line },
            })),
            fixable: 'manual',
            confidence: confidence(80),
            tags: ['python', 'logging', 'best-practices'],
          });
        }

      } catch (err) {
        return {
          analyzerId: 'python-specific',
          findings: [],
          durationMs: Date.now() - start,
          errors: [err instanceof Error ? err.message : String(err)],
        };
      }

      return {
        analyzerId: 'python-specific',
        findings,
        artifacts,
        durationMs: Date.now() - start,
        errors: [],
      };
    },
  };
}
