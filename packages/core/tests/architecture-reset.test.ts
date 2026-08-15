import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { createDeterministicFindingId, createFinding } from '../src/findings/Finding.js';
import type { ReviewRun } from '../src/protocol/index.js';

const repoRoot = resolve(__dirname, '../../..');
const packageDirs = ['apps', 'packages'] as const;

function workspacePackagePaths(): string[] {
  return packageDirs.flatMap((base) =>
    readdirSync(join(repoRoot, base)).map((entry) => join(repoRoot, base, entry)),
  );
}

function workspacePackageMap(): Map<string, { dir: string; deps: string[] }> {
  return new Map(
    workspacePackagePaths().map((dir) => {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8')) as {
        name: string;
        dependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
      };
      const deps = Object.keys({ ...(pkg.dependencies ?? {}), ...(pkg.peerDependencies ?? {}) })
        .filter((name) => name.startsWith('@turpan/'));
      return [pkg.name, { dir, deps }];
    }),
  );
}

describe('architecture reset guardrails', () => {
  it('keeps package dependencies directional with no package -> app edges', () => {
    const graph = workspacePackageMap();
    for (const [name, entry] of graph) {
      if (!entry.dir.includes('/packages/')) continue;
      for (const dep of entry.deps) {
        const depEntry = graph.get(dep);
        expect(depEntry, `missing workspace package ${dep}`).toBeDefined();
        expect(depEntry!.dir.includes('/apps/')).toBe(false);
      }
      if (name === '@turpan/core') {
        expect(entry.deps).not.toContain('@turpan/cli');
        expect(entry.deps).not.toContain('@turpan/mcp-server');
      }
    }
  });

  it('has no circular workspace package dependencies', () => {
    const graph = workspacePackageMap();
    const visiting = new Set<string>();
    const visited = new Set<string>();

    const visit = (name: string, stack: string[] = []) => {
      if (visited.has(name)) return;
      if (visiting.has(name)) {
        throw new Error(`Cycle detected: ${[...stack, name].join(' -> ')}`);
      }
      visiting.add(name);
      const entry = graph.get(name);
      for (const dep of entry?.deps ?? []) visit(dep, [...stack, name]);
      visiting.delete(name);
      visited.add(name);
    };

    for (const name of graph.keys()) visit(name);
  });

  it('keeps CLI and MCP adapters thin and free of finding construction', () => {
    const adapterFiles = [
      join(repoRoot, 'apps/cli/src/index.ts'),
      join(repoRoot, 'apps/mcp-server/src/tools/review.ts'),
    ];

    for (const file of adapterFiles) {
      const source = readFileSync(file, 'utf-8');
      expect(source.includes('createFinding('), file).toBe(false);
      expect(source.includes('class ReviewOrchestrator'), file).toBe(false);
    }
  });

  it('exposes a serializable review protocol', () => {
    const run: ReviewRun = {
      id: 'run-1',
      request: { projectPath: '/tmp/project', mode: 'fast', includeSecurity: true },
      startedAt: '2026-08-15T00:00:00.000Z',
      verdict: 'GO',
      tasks: [{ id: 'task-1', kind: 'fingerprint', label: 'Fingerprint', status: 'completed' }],
      findings: [{
        id: 'fnd-1',
        category: 'security',
        severity: 'high',
        confidence: 95,
        title: 'Unsafe command',
        explanation: 'Shell execution uses an unsafe pattern.',
        evidence: [{ kind: 'code', path: 'src/index.ts', excerpt: 'exec(userInput)' }],
      }],
      toolCalls: [{ id: 'tool-1', tool: 'command', input: { argv: ['pnpm', 'test'] }, exitCode: 0 }],
      artifacts: [{ id: 'artifact-1', kind: 'report', path: '.turpan/runs/latest/TURPAN_ANALYSIS.md' }],
    };

    expect(JSON.parse(JSON.stringify(run))).toEqual(run);
  });

  it('creates deterministic finding ids for identical evidence-backed findings', () => {
    const seed = {
      title: 'Unsafe execution',
      category: 'security' as const,
      severity: 'high' as const,
      explanation: 'Command uses shell execution.',
      evidence: [{ type: 'code' as const, path: 'src/index.ts', excerpt: 'exec(userInput)' }],
    };

    expect(createDeterministicFindingId(seed)).toBe(createDeterministicFindingId(seed));

    const first = createFinding(seed);
    const second = createFinding(seed);
    expect(first.id).toBe(second.id);
  });
});
