/**
 * FixCandidate — wraps a Finding with fix metadata and generates replacement snippets.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { lookupStrategy } from './SafeFixCatalog.js';
// ─── Confidence & Confidence Threshold ────────────────────────────────────────
let _candidateIdCounter = 0;
function genCandidateId() {
    return `fix-${Date.now().toString(36)}${(_candidateIdCounter++).toString(36)}`;
}
// ─── Snippet Extraction ────────────────────────────────────────────────────────
/**
 * Read a file and extract the lines for a fix candidate.
 * Falls back gracefully if the file can't be read.
 */
export function extractSnippet(filePath, startLine, endLine) {
    try {
        const content = readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        // Clamp to valid range
        const start = Math.max(1, startLine);
        const end = Math.min(lines.length, endLine);
        return lines.slice(start - 1, end).join('\n');
    }
    catch {
        return '';
    }
}
/**
 * Create a FixCandidate from a Finding.
 * Returns null if the finding is not fixable.
 */
export function createFixCandidate(finding, projectRoot) {
    const strategy = lookupStrategy(finding);
    if (!strategy)
        return null;
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
export function createFixCandidates(findings, projectRoot) {
    return findings
        .map(f => createFixCandidate(f, projectRoot))
        .filter((c) => c !== null);
}
/**
 * Filter candidates by category.
 */
export function filterByCategory(candidates, category) {
    return candidates.filter(c => c.category === category);
}
/**
 * Filter candidates that pass the minimum confidence threshold.
 */
export function filterByConfidence(candidates, threshold) {
    return candidates.filter(c => c.confidence >= threshold);
}
/**
 * Return candidates that should be auto-applied in auto-safe mode.
 */
export function getAutoSafeCandidates(candidates) {
    return candidates.filter(c => c.autoSafe && c.category === 'safe');
}
/**
 * Get all validation checks needed across a set of candidates (deduplicated).
 */
export function aggregateRequiredChecks(candidates) {
    const set = new Set();
    for (const c of candidates) {
        for (const check of c.requiredChecks)
            set.add(check);
    }
    return Array.from(set);
}
/**
 * Group candidates by file.
 */
export function groupByFile(candidates) {
    const map = new Map();
    for (const c of candidates) {
        const existing = map.get(c.filePath) ?? [];
        existing.push(c);
        map.set(c.filePath, existing);
    }
    return map;
}
//# sourceMappingURL=FixCandidate.js.map