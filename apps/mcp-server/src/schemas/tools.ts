/**
 * Zod schemas for all MCP tool inputs — used for validation and type inference.
 */

import { z } from 'zod';

// ─── Shared schemas ──────────────────────────────────────────────────────────

export const projectPathSchema = z.string().min(1).max(4096);

export const runIdSchema = z.string()
  .regex(/^[a-zA-Z0-9_:-]+$/, 'runId must be alphanumeric with underscores, colons, or hyphens')
  .max(128);

export const severitySchema = z.enum(['critical', 'high', 'medium', 'low', 'info']).optional();

export const categorySchema = z.string().max(128).optional();

export const formatSchema = z.enum(['markdown', 'html', 'json']).default('markdown');

export const fixModeSchema = z.enum(['patch-only', 'apply']).default('patch-only');

// ─── Tool input schemas ──────────────────────────────────────────────────────

export const reviewProjectInputSchema = z.object({
  projectPath: projectPathSchema,
  mode: z.enum(['quick', 'deep']).default('quick'),
  includeUi: z.boolean().default(false),
  includeRuntime: z.boolean().default(false),
  includeSecurity: z.boolean().default(true),
  includeAgentAudit: z.boolean().default(false),
  taskFile: z.string().max(4096).optional(),
  fixMode: fixModeSchema.optional().default('patch-only'),
});

export type ReviewProjectInput = z.infer<typeof reviewProjectInputSchema>;

export const reviewDiffInputSchema = z.object({
  projectPath: projectPathSchema,
  baseRef: z.string().min(1).max(256),
  targetRef: z.string().min(1).max(256),
  includeUi: z.boolean().default(false),
  taskFile: z.string().max(4096).optional(),
});

export type ReviewDiffInput = z.infer<typeof reviewDiffInputSchema>;

export const liveUiTestInputSchema = z.object({
  projectPath: projectPathSchema,
  url: z.string().url().optional(),
  headed: z.boolean().default(false),
  mobile: z.boolean().default(false),
  trace: z.boolean().default(false),
});

export type LiveUiTestInput = z.infer<typeof liveUiTestInputSchema>;

export const agentOutputAuditInputSchema = z.object({
  projectPath: projectPathSchema,
  taskFile: projectPathSchema,
  agentName: z.string().max(64).optional(),
});

export type AgentOutputAuditInput = z.infer<typeof agentOutputAuditInputSchema>;

export const fixFindingsInputSchema = z.object({
  projectPath: projectPathSchema,
  runId: runIdSchema.optional(),
  findingIds: z.array(z.string().max(64)).max(100).optional(),
  fixMode: fixModeSchema,
});

export type FixFindingsInput = z.infer<typeof fixFindingsInputSchema>;

export const getReportInputSchema = z.object({
  projectPath: projectPathSchema,
  runId: runIdSchema.optional(),
  format: formatSchema.default('markdown'),
});

export type GetReportInput = z.infer<typeof getReportInputSchema>;

export const getFindingsInputSchema = z.object({
  projectPath: projectPathSchema,
  runId: runIdSchema.optional(),
  severity: severitySchema,
  category: categorySchema,
});

export type GetFindingsInput = z.infer<typeof getFindingsInputSchema>;