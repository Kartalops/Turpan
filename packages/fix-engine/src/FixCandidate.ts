/**
 * FixCandidate — wraps a Finding with fix metadata and generates replacement snippets.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { Finding } from '@turpan/core';
import type { FixCandidate, FixCategory, ValidationCheck } from './types.js';
import { lookupStrategy, type FixStrategy } from './SafeFixCatalog.js';

// ─── Confidence & Confidence Threshold ────────────────────────────────────────

let _candidateIdCounter = 0;

function genCandidateId(): string {
  return `fix-${Date.now().toString(36)}${(_candidateIdCounter++).toString(36)}`;
}

// ─── Snippet Extraction ────────────────────────────────────────────────────────

/**
 * Read a file and extract the lines for a fix candidate.
 * Falls back gracefully if the file can't be read.
 */
export function extractSnippet(
  filePath: string,
  startLine: number,
  endLine: number
): string {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    // Clamp to valid range
    const start = Math.max(1, startLine);
    const end = Math.min(lines.length, endLine);
    return lines.slice(start - 1, end).join('\n');
  } catch {
    return '';
  }
}

/**
 * Create a FixCandidate from a Finding.
 * Returns null if the finding is not fixable.
 */
export function createFixCandidate(
  finding: Finding,
  projectRoot: string
): FixCandidate | null {
  const strategy = lookupStrategy(finding);
  if (!strategy) return null;

  const { file, line } = finding;
  const filePath = file ? resolve(projectRoot, file) : '';
  const startLine = line ?? 1;
  const endLine = line ?? 1;

  const originalSnippet = filePath
    ? extractSnippet(filePath, startLine, endLine)
    : '';

  const replacement = strategy.generate(finding);

  return {
    id: genCandidateId(),
    finding,
    category: strategy.category,
    description: strategy.label,
    filePath,
    originalSnippet,
    replacementSnippet: replacement?.snippet ?? '',
    startLine,
    endLine,
    risk: strategy.risk,
    reversible: strategy.reversible,
    confidence: finding.confidence,
    requiredChecks: strategy.requiredChecks,
    autoSafe: strategy.autoSafe,
    diffHunkHeader: replacement?.hunkHeader,
  };
}

/**
 * Create multiple FixCandidates from a list of Findings.
 * Filters out non-fixable findings.
 */
export function createFixCandidates(
  findings: Finding[],
  projectRoot: string
): FixCandidate[] {
  return findings
    .map(f => createFixCandidate(f, projectRoot))
    .filter((c): c is FixCandidate => c !== null);
}

/**
 * Filter candidates by category.
 */
export function filterByCategory(
  candidates: FixCandidate[],
  category: FixCategory
): FixCandidate[] {
  return candidates.filter(c => c.category === category);
}

/**
 * Filter candidates that pass the minimum confidence threshold.
 */
export function filterByConfidence(
  candidates: FixCandidate[],
  threshold: number
): FixCandidate[] {
  return candidates.filter(c => c.confidence >= threshold);
}

/**
 * Return candidates that should be auto-applied in auto-safe mode.
 */
export function getAutoSafeCandidates(candidates: FixCandidate[]): FixCandidate[] {
  return candidates.filter(c => c.autoSafe && c.category === 'safe');
}

/**
 * Get all validation checks needed across a set of candidates (deduplicated).
 */
export function aggregateRequiredChecks(candidates: FixCandidate[]): ValidationCheck[] {
  const set = new Set<ValidationCheck>();
  for (const c of candidates) {
    for (const check of c.requiredChecks) set.add(check);
  }
  return Array.from(set);
}

/**
 * Group candidates by file.
 */
export function groupByFile(
  candidates: FixCandidate[]
): Map<string, FixCandidate[]> {
  const map = new Map<string, FixCandidate[]>();
  for (const c of candidates) {
    const existing = map.get(c.filePath) ?? [];
    existing.push(c);
    map.set(c.filePath, existing);
  }
  return map;
}
