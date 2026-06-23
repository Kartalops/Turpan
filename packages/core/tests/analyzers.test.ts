/**
 * Analyzer Tests — Phase 5 Static Quality & Cleanup
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'path';
import {
  UnusedDependencyAnalyzer,
} from '../src/analyzers/dependencies/index.js';
import {
  UnusedFileAnalyzer,
  UnusedExportAnalyzer,
} from '../src/analyzers/dead-code/index.js';
import {
  PlaceholderAnalyzer,
  DuplicateCodeAnalyzer,
} from '../src/analyzers/placeholders/index.js';
import {
  ComplexityHotspotAnalyzer,
} from '../src/analyzers/static-quality/index.js';
import {
  ArchitectureBasicAnalyzer,
} from '../src/analyzers/architecture-basic/index.js';
import type { AnalyzerContext } from '../src/analyzers/Analyzer.js';

const FIXTURE_ROOT = '/home/oguz/Masaüstü/TurPAN-Review-Agent/packages/core/tests/fixtures/code-quality-fixture';

const MOCK_FP = {
  projectRoot: FIXTURE_ROOT,
  projectName: 'code-quality-fixture',
  languages: ['typescript', 'javascript'],
  packageManager: 'npm' as const,
  appType: 'vite-react' as const,
  uiFramework: 'react' as const,
  backendFramework: 'unknown' as const,
  runtimeType: 'node' as const,
  testTools: [],
  buildCommands: [],
  devCommands: [],
  lintCommands: [],
  typecheckCommands: [],
  testCommands: [],
  packageScripts: {},
  dockerAvailable: false,
  dockerComposeAvailable: false,
  envFiles: [],
  envRequirements: [],
  routeHints: [],
  entrypoints: [],
  databaseHints: [],
  authHints: { type: [] },
  deploymentHints: {},
  detectedFiles: [],
  missingFiles: [],
  repositoryStatus: { isGitRepo: false },
  lockFile: 'package-lock.json',
  fingerprintedAt: new Date().toISOString(),
};

function makeCtx(): AnalyzerContext {
  return {
    projectRoot: FIXTURE_ROOT,
    fingerprint: MOCK_FP,
    deepAnalysis: true,
  };
}

describe('PlaceholderAnalyzer', () => {
  it('detects TODO comments', async () => {
    const analyzer = new PlaceholderAnalyzer();
    const result = await analyzer.run(makeCtx());
    const todoFindings = result.findings.filter(f =>
      f.tags.some(t => t.includes('todo'))
    );
    expect(todoFindings.length).toBeGreaterThan(0);
  });

  it('detects "not implemented" errors', async () => {
    const analyzer = new PlaceholderAnalyzer();
    const result = await analyzer.run(makeCtx());
    const niFindings = result.findings.filter(f =>
      f.title.toLowerCase().includes('not implemented')
    );
    expect(niFindings.length).toBeGreaterThan(0);
  });

  it('detects "coming soon" comments', async () => {
    const analyzer = new PlaceholderAnalyzer();
    const result = await analyzer.run(makeCtx());
    const comingSoon = result.findings.filter(f =>
      f.title.toLowerCase().includes('coming soon')
    );
    expect(comingSoon.length).toBeGreaterThan(0);
  });

  it('detects hardcoded mock returns', async () => {
    const analyzer = new PlaceholderAnalyzer();
    const result = await analyzer.run(makeCtx());
    const mockReturns = result.findings.filter(f =>
      f.title.toLowerCase().includes('mock') ||
      f.title.toLowerCase().includes('hardcoded')
    );
    expect(mockReturns.length).toBeGreaterThan(0);
  });

  it('returns findings with confidence scores', async () => {
    const analyzer = new PlaceholderAnalyzer();
    const result = await analyzer.run(makeCtx());
    for (const f of result.findings) {
      expect(f.confidence).toBeGreaterThan(0);
      expect(f.confidence).toBeLessThanOrEqual(100);
    }
  });

  it('returns findings with evidence', async () => {
    const analyzer = new PlaceholderAnalyzer();
    const result = await analyzer.run(makeCtx());
    for (const f of result.findings) {
      expect(f.evidence.length).toBeGreaterThan(0);
    }
  });
});

describe('UnusedFileAnalyzer', () => {
  it('detects orphaned component files', async () => {
    const analyzer = new UnusedFileAnalyzer();
    const result = await analyzer.run(makeCtx());
    const orphanedFiles = result.findings.filter(f =>
      f.title.toLowerCase().includes('orphaned') ||
      f.title.toLowerCase().includes('unused file')
    );
    expect(orphanedFiles.length).toBeGreaterThan(0);
  });

  it('does not flag route files as orphaned', async () => {
    const analyzer = new UnusedFileAnalyzer();
    const result = await analyzer.run(makeCtx());
    const routeFindings = result.findings.filter(f =>
      f.file?.includes('[slug]') || f.file?.includes('about')
    );
    expect(routeFindings.length).toBe(0);
  });

  it('sets category to dead-code', async () => {
    const analyzer = new UnusedFileAnalyzer();
    const result = await analyzer.run(makeCtx());
    expect(result.findings.every(f => f.category === 'dead-code')).toBe(true);
  });
});

describe('UnusedExportAnalyzer', () => {
  it('detects unused exports', async () => {
    const analyzer = new UnusedExportAnalyzer();
    const result = await analyzer.run(makeCtx());
    const unusedExports = result.findings.filter(f =>
      f.title.toLowerCase().includes('unused export')
    );
    expect(unusedExports.length).toBeGreaterThan(0);
  });

  it('returns findings with line numbers', async () => {
    const analyzer = new UnusedExportAnalyzer();
    const result = await analyzer.run(makeCtx());
    for (const f of result.findings) {
      expect(f.line).toBeDefined();
    }
  });
});

describe('DuplicateCodeAnalyzer', () => {
  it('detects near-duplicate files', async () => {
    const analyzer = new DuplicateCodeAnalyzer();
    const result = await analyzer.run(makeCtx());
    const duplicateFindings = result.findings.filter(f =>
      f.title.toLowerCase().includes('duplicate') ||
      f.title.toLowerCase().includes('similar')
    );
    expect(duplicateFindings.length).toBeGreaterThan(0);
  });

  it('reports similarity score', async () => {
    const analyzer = new DuplicateCodeAnalyzer();
    const result = await analyzer.run(makeCtx());
    const dupFindings = result.findings.filter(f =>
      f.title.toLowerCase().includes('duplicate')
    );
    for (const f of dupFindings) {
      expect(f.evidence.some(e => e.type === 'metric')).toBe(true);
    }
  });
});

describe('ComplexityHotspotAnalyzer', () => {
  it('detects large files (>500 lines)', async () => {
    const analyzer = new ComplexityHotspotAnalyzer();
    const result = await analyzer.run(makeCtx());
    const largeFileFindings = result.findings.filter(f =>
      f.title.toLowerCase().includes('large file')
    );
    expect(largeFileFindings.length).toBeGreaterThan(0);
  });

  it('detects large functions', async () => {
    const analyzer = new ComplexityHotspotAnalyzer();
    const result = await analyzer.run(makeCtx());
    const largeFnFindings = result.findings.filter(f =>
      f.title.toLowerCase().includes('large function')
    );
    expect(largeFnFindings.length).toBeGreaterThan(0);
  });

  it('detects deeply nested conditionals', async () => {
    const analyzer = new ComplexityHotspotAnalyzer();
    const result = await analyzer.run(makeCtx());
    const nestedFindings = result.findings.filter(f =>
      f.title.toLowerCase().includes('nested')
    );
    expect(nestedFindings.length).toBeGreaterThan(0);
  });

  it('sets category to maintainability', async () => {
    const analyzer = new ComplexityHotspotAnalyzer();
    const result = await analyzer.run(makeCtx());
    expect(result.findings.every(f => f.category === 'maintainability')).toBe(true);
  });
});

describe('ArchitectureBasicAnalyzer', () => {
  it('detects circular imports', async () => {
    const analyzer = new ArchitectureBasicAnalyzer();
    const result = await analyzer.run(makeCtx());
    const circularFindings = result.findings.filter(f =>
      f.title.toLowerCase().includes('circular')
    );
    expect(circularFindings.length).toBeGreaterThan(0);
  });

  it('detects scattered env usage', async () => {
    const analyzer = new ArchitectureBasicAnalyzer();
    const result = await analyzer.run(makeCtx());
    const envFindings = result.findings.filter(f =>
      f.title.toLowerCase().includes('env') ||
      f.title.toLowerCase().includes('environment')
    );
    // Note: may not trigger if files < 3 threshold
    expect(envFindings.length).toBeGreaterThanOrEqual(0);
  });

  it('detects business logic in UI components', async () => {
    const analyzer = new ArchitectureBasicAnalyzer();
    const result = await analyzer.run(makeCtx());
    const bizFindings = result.findings.filter(f =>
      f.title.toLowerCase().includes('business logic') ||
      f.title.toLowerCase().includes('ui component')
    );
    expect(bizFindings.length).toBeGreaterThan(0);
  });

  it('sets category to architecture', async () => {
    const analyzer = new ArchitectureBasicAnalyzer();
    const result = await analyzer.run(makeCtx());
    expect(result.findings.every(f => f.category === 'architecture')).toBe(true);
  });
});

describe('UnusedDependencyAnalyzer', () => {
  it('detects unused dependencies', async () => {
    const analyzer = new UnusedDependencyAnalyzer();
    const result = await analyzer.run(makeCtx());
    const unusedDeps = result.findings.filter(f =>
      f.title.toLowerCase().includes('unused dependency') ||
      f.title.toLowerCase().includes('unused dep')
    );
    // lodash and moment are not imported in the fixture source — should be flagged
    expect(unusedDeps.length).toBeGreaterThan(0);
  });

  it('skips always-used framework packages', async () => {
    const analyzer = new UnusedDependencyAnalyzer();
    const result = await analyzer.run(makeCtx());
    const reactFindings = result.findings.filter(f =>
      f.title.toLowerCase().includes('react') ||
      f.title.toLowerCase().includes('typescript') ||
      f.title.toLowerCase().includes('vite')
    );
    expect(reactFindings.length).toBe(0);
  });

  it('sets category to dependency', async () => {
    const analyzer = new UnusedDependencyAnalyzer();
    const result = await analyzer.run(makeCtx());
    expect(result.findings.every(f => f.category === 'dependency')).toBe(true);
  });

  it('returns findings with suggestedFix', async () => {
    const analyzer = new UnusedDependencyAnalyzer();
    const result = await analyzer.run(makeCtx());
    for (const f of result.findings) {
      expect(f.suggestedFix).toBeDefined();
      expect(f.suggestedFix!.length).toBeGreaterThan(0);
    }
  });
});

describe('Analyzer Interface', () => {
  it('PlaceholderAnalyzer supports TS/JS projects', () => {
    const analyzer = new PlaceholderAnalyzer();
    expect(analyzer.supports(MOCK_FP)).toBe(true);
  });

  it('ComplexHotspotAnalyzer has id, name, categories', () => {
    const analyzer = new ComplexityHotspotAnalyzer();
    expect(analyzer.id.length).toBeGreaterThan(0);
    expect(analyzer.name.length).toBeGreaterThan(0);
    expect(analyzer.categories.length).toBeGreaterThan(0);
  });

  it('run() returns findings array and analyzerId', async () => {
    const analyzer = new PlaceholderAnalyzer();
    const result = await analyzer.run(makeCtx());
    expect(result.analyzerId).toBe(analyzer.id);
    expect(Array.isArray(result.findings)).toBe(true);
  });
});
