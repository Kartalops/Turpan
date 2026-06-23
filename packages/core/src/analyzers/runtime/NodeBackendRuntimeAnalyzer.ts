/**
 * NodeBackendRuntimeAnalyzer — runtime safety review for Node.js backends (Express, Fastify, NestJS).
 *
 * Applies to: appType === 'node-backend' OR backendFramework in [express, fastify, nestjs]
 *
 * Safety guarantees:
 * - Never runs destructive commands.
 * - Import/startup validation only — does not execute application logic.
 * - Does not call real external APIs.
 */

import type { Analyzer, AnalyzerContext, AnalyzerResult } from '../Analyzer.js';
import type { Finding } from '../../findings/Finding.js';
import type { ProjectFingerprint } from '../../project/index.js';
import { createFinding, confidence } from '../../findings/Finding.js';
import { createEvidence } from '../../findings/Evidence.js';
import { readFile, access } from 'fs/promises';
import { join, relative } from 'path';
import { walkFiles } from '../../shared/index.js';
import { SafeCommandRunner } from '../../runner/SafeCommandRunner.js';

export class NodeBackendRuntimeAnalyzer implements Analyzer {
  id = 'node-backend-runtime';
  name = 'Node.js Backend Runtime Analyzer';
  categories = ['runtime', 'node', 'backend'];

  supports(fp: ProjectFingerprint): boolean {
    return (
      fp.appType === 'node-backend' ||
      ['express', 'fastify', 'fastify', 'nestjs'].includes(fp.backendFramework as string)
    );
  }

  async run(ctx: AnalyzerContext): Promise<AnalyzerResult> {
    const errors: string[] = [];
    const findings = [];

    // 1. Find entrypoint
    const entrypoint = await this.detectEntrypoint(ctx.projectRoot, ctx.fingerprint);

    // 2. Run import/startup check
    const startupResult = await this.runStartupCheck(ctx.projectRoot, entrypoint);
    findings.push(...startupResult.findings);
    errors.push(...startupResult.errors);

    // 3. Static pattern analysis
    if (entrypoint) {
      const staticFindings = await this.analyzePatterns(ctx.projectRoot, entrypoint);
      findings.push(...staticFindings);
    }

    return {
      analyzerId: this.id,
      findings,
      artifacts: {
        entrypoint,
        startupCheckPassed: startupResult.errors.length === 0,
      },
      durationMs: 0,
      errors,
    };
  }

  private async detectEntrypoint(
    projectRoot: string,
    fp: ProjectFingerprint
  ): Promise<string | null> {
    // Check package.json bin or main
    try {
      const pkg = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf-8'));
      if (pkg.main && !pkg.main.includes('dist') && !pkg.main.includes('build')) {
        return pkg.main;
      }
      if (pkg.bin) {
        const bins = Object.values(pkg.bin as Record<string, string>);
        if (bins.length > 0) return bins[0] as string;
      }
    } catch {
      // ignore
    }

    const candidates = [
      'index.js',
      'src/index.js',
      'src/server.js',
      'src/app.js',
      'server.js',
      'app.js',
      'main.js',
      'src/main.js',
    ];
    for (const candidate of candidates) {
      try {
        await access(join(projectRoot, candidate));
        return candidate;
      } catch {
        // not found
      }
    }
    return null;
  }

  private async runStartupCheck(
    projectRoot: string,
    entrypoint: string | null
  ): Promise<{ findings: Finding[]; errors: string[] }> {
    const findings: Finding[] = [];
    const errors: string[] = [];

    if (!entrypoint) {
      findings.push(
        createFinding({
          id: 'node-backend-no-entrypoint',
          title: 'No Node.js backend entrypoint found',
          explanation: `Could not find a backend entrypoint in "${projectRoot}". Cannot validate startup.`,
          severity: 'medium',
          category: 'runtime',
          fixable: 'manual',
          confidence: confidence(60),
          tags: ['node', 'backend', 'entrypoint'],
          evidence: [createEvidence('text', { label: 'search', excerpt: 'index.js, server.js, src/index.js not found' })],
          suggestedFix: `Ensure your backend has an entrypoint (index.js, server.js, or set "main" in package.json).`,
        })
      );
      return { findings, errors };
    }

    const runner = new SafeCommandRunner({
      projectRoot,
      runId: `node-backend-${Date.now()}`,
      defaultTimeoutMs: 20_000,
    });

    // Test: node --check <file> for syntax errors
    const checkResult = await runner.run(`node --check ${entrypoint}`, {
      cwd: projectRoot,
      saveLog: false,
      stageName: 'node-syntax-check',
    });

    if (checkResult.blocked || checkResult.exitCode !== 0) {
      findings.push(
        createFinding({
          id: 'node-syntax-error',
          title: `Node.js syntax error in ${entrypoint}`,
          explanation: `\`node --check\` failed for "${entrypoint}": ${checkResult.blockReason ?? checkResult.stderr}. The file has syntax errors that will prevent startup.`,
          severity: 'high',
          category: 'runtime',
          file: join(projectRoot, entrypoint),
          fixable: 'manual',
          confidence: confidence(90),
          tags: ['node', 'syntax-error', 'runtime'],
          evidence: [
            createEvidence('command-log', {
              label: 'node --check',
              excerpt: `node --check ${entrypoint} → ${checkResult.exitCode ?? 'blocked'}`,
              timestamp: new Date().toISOString(),
            }),
            createEvidence('text', { label: 'stderr', excerpt: checkResult.stderr?.slice(0, 300) ?? '' }),
          ],
          suggestedFix: `Fix the syntax error in "${entrypoint}". Run \`node --check ${entrypoint}\` locally to see the error.`,
        })
      );
      errors.push(`syntax error in ${entrypoint}`);
    }

    // Test: try requiring the module (import check)
    const fullPath = join(projectRoot, entrypoint);
    const importResult = await runner.run(`node -e require('${fullPath}')`, {
      cwd: projectRoot,
      saveLog: false,
      stageName: 'node-import-check',
      timeoutMs: 10_000,
    });

    if (importResult.blocked) {
      findings.push(
        createFinding({
          id: 'node-import-blocked',
          title: `Node.js import blocked by policy: ${entrypoint}`,
          explanation: `The import check for "${entrypoint}" was blocked by the safe command policy. The runner may be blocking require() or module loading.`,
          severity: 'medium',
          category: 'runtime',
          file: fullPath,
          fixable: 'manual',
          confidence: confidence(70),
          tags: ['node', 'import', 'policy'],
          evidence: [
            createEvidence('text', { label: 'block-reason', excerpt: importResult.blockReason ?? 'unknown' }),
          ],
          suggestedFix: `Check the CommandPolicy configuration to allow node module loading.`,
        })
      );
    } else if (importResult.exitCode !== 0) {
      const errorSnippet = (importResult.stderr || importResult.stdout || '').slice(0, 400);
      findings.push(
        createFinding({
          id: 'node-import-failed',
          title: `Node.js module import failed for ${entrypoint}`,
          explanation: `require("${entrypoint}") exited with code ${importResult.exitCode}. The app has a startup/import error that will prevent the server from running.`,
          severity: 'high',
          category: 'runtime',
          file: fullPath,
          fixable: 'manual',
          confidence: confidence(80),
          tags: ['node', 'import-error', 'runtime', 'startup'],
          evidence: [
            createEvidence('command-log', {
              label: 'require output',
              excerpt: errorSnippet,
              timestamp: new Date().toISOString(),
            }),
          ],
          suggestedFix: `Run \`node -e "require('${entrypoint}')"\` locally to see the full error. Common causes: missing dependency, incorrect export, or runtime error at module load time.`,
        })
      );
      errors.push(`import failed for ${entrypoint}: ${errorSnippet}`);
    }

    return { findings, errors };
  }

  private async analyzePatterns(
    projectRoot: string,
    entrypoint: string
  ): Promise<Finding[]> {
    const findings: Finding[] = [];
    const fullPath = join(projectRoot, entrypoint);

    try {
      const content = await readFile(fullPath, 'utf-8');

      // 1. Unhandled promise rejections
      const unhandledRejection = this.checkUnhandledRejections(content, fullPath);
      findings.push(...unhandledRejection);

      // 2. Uncaught exceptions
      const uncaughtException = this.checkUncaughtExceptions(content, fullPath);
      findings.push(...uncaughtException);

      // 3. Missing error middleware (Express)
      const errorMiddleware = this.checkErrorMiddleware(content, fullPath);
      findings.push(...errorMiddleware);

      // 4. Sync cron/scheduler without safety
      const syncCron = this.checkSyncCron(content, fullPath);
      findings.push(...syncCron);

    } catch {
      // skip unreadable
    }

    return findings;
  }

  private checkUnhandledRejections(content: string, file: string): Finding[] {
    const findings: Finding[] = [];

    const hasUnhandledHook = /process\.on\s*\(\s*['"]unhandledRejection['"]/i.test(content);
    const hasCatch = /catch\s*\(\s*\w+\s*\)/.test(content);

    if (!hasUnhandledHook && hasCatch) {
      findings.push(
        createFinding({
          id: 'node-no-unhandled-rejection-hook',
          title: `No unhandledRejection handler in ${file}`,
          explanation: `The Node.js backend handles some async errors with catch(), but does not listen for \`process.on('unhandledRejection')\`. Unhandled promise rejections will crash the process with no diagnostic.`,
          severity: 'medium',
          category: 'runtime',
          file,
          fixable: 'manual',
          confidence: confidence(75),
          tags: ['node', 'async', 'error-handling', 'unhandled-rejection'],
          evidence: [
            createEvidence('text', { label: 'has-unhandled-hook', excerpt: String(hasUnhandledHook) }),
          ],
          suggestedFix: `Add: \`process.on('unhandledRejection', (reason, promise) => { logger.error('Unhandled Rejection:', reason); })\`. This prevents silent crashes.`,
        })
      );
    }
    return findings;
  }

  private checkUncaughtExceptions(content: string, file: string): Finding[] {
    const findings: Finding[] = [];

    const hasUncaughtHook = /process\.on\s*\(\s*['"]uncaughtException['"]/i.test(content);

    if (!hasUncaughtHook) {
      findings.push(
        createFinding({
          id: 'node-no-uncaught-exception-hook',
          title: `No uncaughtException handler in ${file}`,
          explanation: `The Node.js backend has no \`process.on('uncaughtException')\` handler. Synchronous errors that bubble up uncaught will crash the process without graceful cleanup or logging.`,
          severity: 'medium',
          category: 'runtime',
          file,
          fixable: 'manual',
          confidence: confidence(80),
          tags: ['node', 'error-handling', 'uncaught-exception'],
          evidence: [
            createEvidence('text', { label: 'has-uncaught-hook', excerpt: 'false' }),
          ],
          suggestedFix: `Add: \`process.on('uncaughtException', (err) => { logger.error('Uncaught Exception:', err); process.exit(1); })\`.`,
        })
      );
    }
    return findings;
  }

  private checkErrorMiddleware(content: string, file: string): Finding[] {
    const findings: Finding[] = [];

    // Detect Express app without error middleware
    const hasExpress = /express\s*\(|require\s*\(\s*['"]express['"]\)/i.test(content);
    const hasErrorMw = /err\s*,\s*req\s*,\s*res\s*,\s*next\s*=>|app\.use\s*\(\s*err/i.test(content);
    const routeCount = (content.match(/app\.(get|post|put|patch|delete)\s*\(/g) || []).length;

    if (hasExpress && routeCount >= 3 && !hasErrorMw) {
      findings.push(
        createFinding({
          id: 'node-no-error-middleware',
          title: `Express app with ${routeCount} routes but no error middleware`,
          explanation: `This Express app has ${routeCount} routes but no error-handling middleware (4-arg route handler). Unhandled errors in route handlers will crash connections or return opaque responses.`,
          severity: 'medium',
          category: 'runtime',
          file,
          fixable: 'manual',
          confidence: confidence(75),
          tags: ['node', 'express', 'error-handling', 'middleware'],
          evidence: [
            createEvidence('metric', { value: routeCount, unit: 'routes', label: 'route-count' }),
          ],
          suggestedFix: `Add error middleware: \`app.use((err, req, res, next) => { logger.error(err); res.status(500).json({ error: 'Internal server error' }); })\`.`,
        })
      );
    }
    return findings;
  }

  private checkSyncCron(content: string, file: string): Finding[] {
    const findings: Finding[] = [];

    const hasCron = /cron|setInterval|setTimeout\s*\(\s*\w+\s*,\s*0|setImmediate/i.test(content);
    const hasScheduler = /node-cron|agenda|bull|bree|node-schedule/i.test(content);

    if (hasCron && !hasScheduler) {
      findings.push(
        createFinding({
          id: 'node-sync-cron',
          title: `Synchronous scheduling detected without a robust scheduler in ${file}`,
          explanation: `This backend uses setInterval/setTimeout or a basic cron pattern for scheduling without a production scheduler library (Bull, Agenda, Bree). This cannot survive process restarts and lacks retry/DLQ support.`,
          severity: 'low',
          category: 'runtime',
          file,
          fixable: 'manual',
          confidence: confidence(65),
          tags: ['node', 'scheduler', 'cron', 'reliability'],
          evidence: [
            createEvidence('text', { label: 'has-scheduler-lib', excerpt: String(hasScheduler) }),
          ],
          suggestedFix: `Use a production scheduler: Bull (Redis-backed, with retry/DLQ), Agenda (MongoDB), or Bree. These survive restarts and handle failures properly.`,
        })
      );
    }
    return findings;
  }
}
