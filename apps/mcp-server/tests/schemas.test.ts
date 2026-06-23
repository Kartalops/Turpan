/**
 * Tool schema validation tests — verify all input schemas reject invalid data.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  reviewProjectInputSchema,
  reviewDiffInputSchema,
  liveUiTestInputSchema,
  agentOutputAuditInputSchema,
  fixFindingsInputSchema,
  getReportInputSchema,
  getFindingsInputSchema,
} from '../src/schemas/tools.js';

describe('reviewProjectInputSchema', () => {
  it('accepts valid quick mode input', () => {
    const result = reviewProjectInputSchema.safeParse({
      projectPath: '/tmp/test-project',
      mode: 'quick',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid deep mode with all options', () => {
    const result = reviewProjectInputSchema.safeParse({
      projectPath: '/tmp/test-project',
      mode: 'deep',
      includeUi: true,
      includeRuntime: true,
      includeSecurity: true,
      includeAgentAudit: true,
      taskFile: '/tmp/test-project/.turpan/task.md',
      fixMode: 'apply',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty projectPath', () => {
    const result = reviewProjectInputSchema.safeParse({ projectPath: '' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid mode', () => {
    const result = reviewProjectInputSchema.safeParse({
      projectPath: '/tmp/test',
      mode: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid fixMode', () => {
    const result = reviewProjectInputSchema.safeParse({
      projectPath: '/tmp/test',
      fixMode: 'delete-everything',
    });
    expect(result.success).toBe(false);
  });

  it('applies default values', () => {
    const result = reviewProjectInputSchema.safeParse({ projectPath: '/tmp/test' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mode).toBe('quick');
      expect(result.data.includeUi).toBe(false);
      expect(result.data.includeSecurity).toBe(true);
      expect(result.data.fixMode).toBe('patch-only');
    }
  });
});

describe('reviewDiffInputSchema', () => {
  it('accepts valid diff review input', () => {
    const result = reviewDiffInputSchema.safeParse({
      projectPath: '/tmp/test',
      baseRef: 'main',
      targetRef: 'feature-branch',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing baseRef', () => {
    const result = reviewDiffInputSchema.safeParse({
      projectPath: '/tmp/test',
      targetRef: 'feature',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty refs', () => {
    const result = reviewDiffInputSchema.safeParse({
      projectPath: '/tmp/test',
      baseRef: '',
      targetRef: 'main',
    });
    expect(result.success).toBe(false);
  });
});

describe('liveUiTestInputSchema', () => {
  it('accepts valid UI test input', () => {
    const result = liveUiTestInputSchema.safeParse({
      projectPath: '/tmp/test',
      headed: false,
      mobile: true,
    });
    expect(result.success).toBe(true);
  });

  it('accepts URL override', () => {
    const result = liveUiTestInputSchema.safeParse({
      projectPath: '/tmp/test',
      url: 'http://localhost:3000',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid URL', () => {
    const result = liveUiTestInputSchema.safeParse({
      projectPath: '/tmp/test',
      url: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });
});

describe('fixFindingsInputSchema', () => {
  it('accepts patch-only mode', () => {
    const result = fixFindingsInputSchema.safeParse({
      projectPath: '/tmp/test',
      fixMode: 'patch-only',
    });
    expect(result.success).toBe(true);
  });

  it('accepts apply mode', () => {
    const result = fixFindingsInputSchema.safeParse({
      projectPath: '/tmp/test',
      fixMode: 'apply',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid fixMode', () => {
    const result = fixFindingsInputSchema.safeParse({
      projectPath: '/tmp/test',
      fixMode: 'auto-safe',
    });
    expect(result.success).toBe(false);
  });

  it('rejects more than 100 findingIds', () => {
    const result = fixFindingsInputSchema.safeParse({
      projectPath: '/tmp/test',
      findingIds: Array.from({ length: 101 }, (_, i) => `finding-${i}`),
      fixMode: 'patch-only',
    });
    expect(result.success).toBe(false);
  });

  it('accepts specific findingIds', () => {
    const result = fixFindingsInputSchema.safeParse({
      projectPath: '/tmp/test',
      runId: '2026-06-20T10-00-00-000Z',
      findingIds: ['finding-1', 'finding-2'],
      fixMode: 'patch-only',
    });
    expect(result.success).toBe(true);
  });
});

describe('getReportInputSchema', () => {
  it('accepts markdown format', () => {
    const result = getReportInputSchema.safeParse({ projectPath: '/tmp/test', format: 'markdown' });
    expect(result.success).toBe(true);
  });

  it('accepts html format', () => {
    const result = getReportInputSchema.safeParse({ projectPath: '/tmp/test', format: 'html' });
    expect(result.success).toBe(true);
  });

  it('accepts json format', () => {
    const result = getReportInputSchema.safeParse({ projectPath: '/tmp/test', format: 'json' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid format', () => {
    const result = getReportInputSchema.safeParse({ projectPath: '/tmp/test', format: 'pdf' });
    expect(result.success).toBe(false);
  });

  it('defaults format to markdown', () => {
    const result = getReportInputSchema.safeParse({ projectPath: '/tmp/test' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.format).toBe('markdown');
  });
});

describe('getFindingsInputSchema', () => {
  it('accepts all severity levels', () => {
    for (const sev of ['critical', 'high', 'medium', 'low', 'info']) {
      const result = getFindingsInputSchema.safeParse({ projectPath: '/tmp/test', severity: sev });
      expect(result.success).toBe(true);
    }
  });

  it('accepts empty filters', () => {
    const result = getFindingsInputSchema.safeParse({ projectPath: '/tmp/test' });
    expect(result.success).toBe(true);
  });

  it('accepts both severity and category', () => {
    const result = getFindingsInputSchema.safeParse({
      projectPath: '/tmp/test',
      severity: 'high',
      category: 'security',
    });
    expect(result.success).toBe(true);
  });
});