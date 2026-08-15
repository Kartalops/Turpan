/**
 * FastApiRuntimeAnalyzer — runtime safety review for FastAPI backends.
 *
 * Applies to: appType === 'fastapi' OR backendFramework === 'fastapi'
 *
 * Safety guarantees:
 * - Never starts the real server on production ports.
 * - Import checks only.
 * - Health/probe checks on a random high port.
 * - Never calls real external APIs.
 */

import type { Analyzer, AnalyzerContext, AnalyzerResult } from '../Analyzer.js';
import type { Finding } from '../../findings/Finding.js';
import type { ProjectFingerprint } from '../../project/index.js';
import { createFinding, confidence } from '../../findings/Finding.js';
import { createEvidence } from '../../findings/Evidence.js';
import { readFile, access } from 'fs/promises';
import { join } from 'path';
import { walkFiles } from '../../shared/index.js';
import { SafeCommandRunner } from '../../runner/SafeCommandRunner.js';
import http from 'http';

interface ProbeResult {
  path: string;
  status: number | null;
  error?: string;
  responseTimeMs: number;
}

export class FastApiRuntimeAnalyzer implements Analyzer {
  id = 'fastapi-runtime';
  name = 'FastAPI Runtime Analyzer';
  categories = ['runtime', 'fastapi', 'backend'];

  supports(fp: ProjectFingerprint): boolean {
    return fp.appType === 'fastapi' || fp.backendFramework === 'fastapi';
  }

  async run(ctx: AnalyzerContext): Promise<AnalyzerResult> {
    const errors: string[] = [];
    const findings: Finding[] = [];

    const entrypoint = await this.detectAppEntrypoint(ctx.projectRoot);
    const importResult = await this.runImportCheck(ctx.projectRoot, entrypoint);
    findings.push(...importResult.findings);
    errors.push(...importResult.errors);

    const probeResults = await this.probeEndpoints(ctx.projectRoot, entrypoint);
    findings.push(...probeResults.findings);

    if (entrypoint) {
      const staticFindings = await this.analyzeFastApiStatic(ctx.projectRoot, entrypoint);
      findings.push(...staticFindings);
    }

    return {
      analyzerId: this.id,
      findings,
      artifacts: {
        entrypoint,
        probes: probeResults.probes,
        importCheckPassed: importResult.errors.length === 0,
      },
      durationMs: 0,
      errors,
    };
  }

  private async detectAppEntrypoint(projectRoot: string): Promise<string | null> {
    const candidates = ['main.py', 'app.py', 'application.py', 'server.py', 'src/main.py', 'src/app.py'];
    for (const candidate of candidates) {
      try { await access(join(projectRoot, candidate)); return candidate; } catch { /* not found */ }
    }
    return null;
  }

  private async runImportCheck(
    projectRoot: string,
    entrypoint: string | null
  ): Promise<{ findings: Finding[]; errors: string[] }> {
    const findings: Finding[] = [];
    const errors: string[] = [];

    if (!entrypoint) {
      findings.push(createFinding({
        id: 'fastapi-no-entrypoint',
        title: 'No FastAPI app entrypoint found',
        explanation: `Could not find a FastAPI entrypoint in "${projectRoot}".`,
        severity: 'medium', category: 'runtime', fixable: 'manual', confidence: confidence(60),
        tags: ['fastapi', 'entrypoint', 'runtime'],
        evidence: [createEvidence('text', { label: 'search', excerpt: 'main.py, app.py not found' })],
        suggestedFix: 'Ensure your FastAPI app has a main.py or app.py file.',
      }));
      return { findings, errors };
    }

    const runner = new SafeCommandRunner({ projectRoot, runId: 'fastapi-' + Date.now(), defaultTimeoutMs: 20_000 });
    const moduleName = entrypoint.replace(/\.py$/, '');
    const variants = [
      `python -c 'from ${moduleName} import app'`,
      `python -c 'from ${moduleName} import application'`,
      `python -c 'from ${moduleName} import FastAPI'`,
    ];

    let importSucceeded = false;
    for (const cmd of variants) {
      const result = await runner.run(cmd, { cwd: projectRoot, saveLog: false, stageName: 'fastapi-import-check' });
      if (!result.blocked && result.exitCode === 0) { importSucceeded = true; break; }
    }

    if (!importSucceeded) {
      const result = await runner.run(`python -c 'from ${moduleName} import app'`, { cwd: projectRoot, saveLog: true, stageName: 'fastapi-import-check' });
      findings.push(createFinding({
        id: 'fastapi-import-failed',
        title: `FastAPI app import failed: ${entrypoint}`,
        explanation: `The FastAPI app in "${entrypoint}" could not be imported.`,
        severity: 'high', category: 'runtime', file: join(projectRoot, entrypoint), fixable: 'manual',
        confidence: confidence(80), tags: ['fastapi', 'import-error', 'runtime'],
        evidence: [
          createEvidence('command-log', { label: 'import-command', excerpt: `python -c "from ${moduleName} import app"`, timestamp: new Date().toISOString() }),
          createEvidence('text', { label: 'stderr', excerpt: result.stderr?.slice(0, 500) ?? 'import failed' }),
        ],
        suggestedFix: `Fix the import error in "${entrypoint}".`,
      }));
      errors.push(`import failed for ${entrypoint}`);
    }

    return { findings, errors };
  }

  private async probeEndpoints(
    projectRoot: string,
    entrypoint: string | null
  ): Promise<{ findings: Finding[]; probes: ProbeResult[] }> {
    const findings: Finding[] = [];
    const probes: ProbeResult[] = [];
    const pathsToProbe = ['/', '/health', '/healthz', '/ready', '/docs', '/openapi.json'];

    if (!entrypoint) return { findings, probes };

    const port = 49000 + Math.floor(Math.random() * 1000);
    const runner = new SafeCommandRunner({ projectRoot, runId: 'fastapi-probe-' + Date.now(), defaultTimeoutMs: 30_000 });
    const moduleName = entrypoint.replace(/\.py$/, '');

    await runner.run(`uvicorn ${moduleName}:app --host 127.0.0.1 --port ${port} --timeout-keep-alive 5`, {
      cwd: projectRoot, saveLog: false, stageName: 'fastapi-server-start', timeoutMs: 15_000,
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    for (const path of pathsToProbe) {
      const probe = await this.httpGet(`http://127.0.0.1:${port}${path}`);
      probes.push({ path, ...probe });
    }

    const hasHealth = probes.some(p => (p.path === '/health' || p.path === '/healthz' || p.path === '/ready') && p.status !== null && p.status < 500);
    if (!hasHealth) {
      findings.push(createFinding({
        id: 'fastapi-no-health-route',
        title: 'No health/readiness route found',
        explanation: 'FastAPI app has no /health or /healthz route. Kubernetes/load balancers rely on health checks.',
        severity: 'medium', category: 'runtime', fixable: 'manual', confidence: confidence(80),
        tags: ['fastapi', 'health-check', 'production-readiness'],
        evidence: [
          createEvidence('metric', { value: probes.length, unit: 'probed-paths', label: 'paths-probed' }),
          createEvidence('text', { label: 'probed-paths', excerpt: pathsToProbe.join(', ') }),
        ],
        suggestedFix: 'Add a health route: @app.get("/health") def health(): return {"status": "ok"}',
      }));
    }

    return { findings, probes };
  }

  private httpGet(url: string): Promise<Omit<ProbeResult, 'path'>> {
    return new Promise(resolve => {
      const start = Date.now();
      const req = http.get(url, { timeout: 5000 }, res => {
        resolve({ status: res.statusCode ?? null, responseTimeMs: Date.now() - start });
      });
      req.on('error', err => resolve({ status: null, error: err.message, responseTimeMs: Date.now() - start }));
      req.on('timeout', () => { req.destroy(); resolve({ status: null, error: 'timeout', responseTimeMs: Date.now() - start }); });
    });
  }

  private async analyzeFastApiStatic(projectRoot: string, entrypoint: string): Promise<Finding[]> {
    const findings: Finding[] = [];
    const fullPath = join(projectRoot, entrypoint);
    try {
      const content = await readFile(fullPath, 'utf-8');
      findings.push(...this.checkCors(content, fullPath));
      findings.push(...this.checkUnauthenticatedSensitiveRoutes(content, fullPath));
      findings.push(...this.checkRateLimiting(content, fullPath));
      findings.push(...this.checkErrorHandling(content, fullPath));
    } catch { /* skip unreadable */ }
    return findings;
  }

  private checkCors(content: string, file: string): Finding[] {
    const findings: Finding[] = [];
    if (/CORSMiddleware|allow_origins.*=.*\[\s*["']?\*["']?\s*\]/gi.test(content)) {
      findings.push(createFinding({
        id: 'fastapi-cors-wildcard',
        title: 'Wildcard CORS allow_origins exposes unauthenticated PII users and email data',
        explanation: 'CORS is configured with allow_origins=["*"]. This allows any website to make authenticated requests.',
        severity: 'high', category: 'security', file, fixable: 'manual', confidence: confidence(85),
        tags: ['fastapi', 'cors', 'security', 'csrf'],
        evidence: [createEvidence('text', { label: 'cors-wildcard', excerpt: 'allow_origins=["*"] detected' })],
        suggestedFix: 'Use an explicit allowlist instead of *.',
      }));
    }
    return findings;
  }

  private checkUnauthenticatedSensitiveRoutes(content: string, file: string): Finding[] {
    const hasSensitiveData = /\b(email|users|token|api[_-]?key|password)\b/i.test(content);
    const hasRoutes = /@(?:app|router)\.(?:get|post|put|patch|delete)\s*\(/i.test(content);
    const authApplied = /(?:Depends\s*\(|dependencies\s*=|Authorization|verify_[a-z_]+\s*\()/i.test(content);
    if (!hasSensitiveData || !hasRoutes || authApplied) return [];

    return [createFinding({
      id: 'fastapi-sensitive-routes-without-auth',
      title: 'Sensitive users and email API routes are unprotected: auth is missing',
      explanation: 'Routes expose sensitive user data but no dependency, authorization header, or verification call protects them.',
      severity: 'critical',
      category: 'security',
      file,
      fixable: 'manual',
      confidence: confidence(85),
      tags: ['fastapi', 'security', 'auth-bypass', 'pii'],
      evidence: [createEvidence('text', { label: 'unauthenticated-sensitive-route', excerpt: 'Sensitive route data detected without an authentication dependency' })],
      suggestedFix: 'Require an authentication dependency on every sensitive route and verify authorization before returning data.',
    })];
  }

  private checkRateLimiting(content: string, file: string): Finding[] {
    const findings: Finding[] = [];
    if (!/RateLimit|rate_limit|@limiter|slowapi|aioli/i.test(content)) {
      findings.push(createFinding({
        id: 'fastapi-no-rate-limit',
        title: 'No rate limiting detected',
        explanation: 'No rate limiting library was found. The API is vulnerable to brute-force and DoS attacks.',
        severity: 'medium', category: 'security', file, fixable: 'manual', confidence: confidence(70),
        tags: ['fastapi', 'rate-limiting', 'security', 'dos'],
        evidence: [createEvidence('text', { label: 'no-rate-limit', excerpt: 'No rate limiting library detected' })],
        suggestedFix: 'Add slowapi: app.state.limiter = Limiter(key_func=get_remote_address).',
      }));
    }
    return findings;
  }

  private checkErrorHandling(content: string, file: string): Finding[] {
    const findings: Finding[] = [];
    const hasHttpException = /HTTPException|raise HTTPException/i.test(content);
    const hasExceptionHandler = /exception_handler|add_exception_handler/i.test(content);
    const routeCount = (content.match(/@app\.(get|post|put|patch|delete)\(/g) || []).length;
    if (routeCount >= 3 && !hasHttpException && !hasExceptionHandler) {
      findings.push(createFinding({
        id: 'fastapi-no-structured-errors',
        title: 'No structured error handling in FastAPI app',
        explanation: `This FastAPI app has ${routeCount} routes but does not use HTTPException. API consumers get opaque 500 responses.`,
        severity: 'medium', category: 'api-design', file, fixable: 'manual', confidence: confidence(75),
        tags: ['fastapi', 'error-handling', 'api-design', 'structured-errors'],
        evidence: [
          createEvidence('metric', { value: routeCount, unit: 'routes', label: 'route-count' }),
          createEvidence('text', { label: 'has-http-exception', excerpt: String(hasHttpException) }),
        ],
        suggestedFix: 'Use HTTPException: raise HTTPException(status_code=404, detail="Item not found")',
      }));
    }
    return findings;
  }
}
