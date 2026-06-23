/**
 * Duplicate Code / Basic Clone Detection Analyzer
 * Detects near-duplicate files and repeated code blocks.
 * Conservative: only flags files with high similarity.
 */

import type { Analyzer, AnalyzerContext, AnalyzerResult } from '../Analyzer.js';
import type { ProjectFingerprint } from '../../project/index.js';
import { createFinding, confidence } from '../../findings/Finding.js';
import { createEvidence } from '../../findings/Evidence.js';
import { readFile } from 'fs/promises';
import { relative } from 'path';
import { walkFiles } from '../../shared/index.js';

const MIN_LINES = 10;       // Minimum lines to consider for duplicate detection
const SIMILARITY_THRESHOLD = 0.85; // 85% similarity -> flagged as duplicate

export class DuplicateCodeAnalyzer implements Analyzer {
  id = 'duplicate-code';
  name = 'Duplicate Code Analyzer';
  categories = ['maintainability'];

  supports(fp: ProjectFingerprint): boolean {
    return fp.languages.includes('typescript') || fp.languages.includes('javascript');
  }

  async run(ctx: AnalyzerContext): Promise<AnalyzerResult> {
    const errors: string[] = [];
    const findings = [];

    const files = await this.findSourceFiles(ctx.projectRoot);
    if (files.length < 2) {
      return { analyzerId: this.id, findings: [], durationMs: 0, errors: [] };
    }

    // Read all files
    const fileContents = new Map<string, { lines: string[]; content: string }>();
    for (const file of files) {
      try {
        const content = await readFile(file, 'utf-8');
        const lines = content.split('\n');
        fileContents.set(file, { lines, content });
      } catch {
        // Skip unreadable
      }
    }

    // Compare file pairs for duplicates
    const checked = new Set<string>();
    const entries = [...fileContents.entries()];

    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [fileA, dataA] = entries[i];
        const [fileB, dataB] = entries[j];

        const pairKey = `${fileA}:${fileB}`;
        if (checked.has(pairKey)) continue;
        checked.add(pairKey);

        const similarity = this.computeSimilarity(dataA.content, dataB.content);
        if (similarity >= SIMILARITY_THRESHOLD) {
          const relA = relative(ctx.projectRoot, fileA);
          const relB = relative(ctx.projectRoot, fileB);

          findings.push(
            createFinding({
              id: `dup-${relA.replace(/[^a-z0-9]/gi, '-')}-${relB.replace(/[^a-z0-9]/gi, '-')}`,
              title: `Near-duplicate files: ${relA} and ${relB}`,
              explanation: `Files "${relA}" and "${relB}" are ${Math.round(similarity * 100)}% similar (${dataA.lines.length} vs ${dataB.lines.length} lines). This suggests code duplication that should be refactored into a shared module.`,
              severity: similarity >= 0.95 ? 'medium' : 'low',
              category: 'maintainability',
              fixable: 'manual',
              confidence: confidence(similarity * 95),
              tags: ['duplicate-code', 'code-clone', 'refactor'],
              evidence: [
                createEvidence('file', { path: fileA, label: 'file-a', excerpt: `Length: ${dataA.lines.length} lines` }),
                createEvidence('file', { path: fileB, label: 'file-b', excerpt: `Length: ${dataB.lines.length} lines` }),
                createEvidence('metric', { value: Math.round(similarity * 100), unit: '%', label: 'similarity' }),
              ],
              suggestedFix: `Extract the shared logic into a common utility/module and import it from both files. Delete one of the duplicates.`,
            })
          );
        }
      }
    }

    return { analyzerId: this.id, findings, durationMs: 0, errors };
  }

  private async findSourceFiles(projectRoot: string): Promise<string[]> {
    const ignoredDirs = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage', '.turpan']);
    return walkFiles({
      cwd: projectRoot,
      extensions: ['ts', 'tsx', 'js', 'jsx'],
      ignoreDirs: ignoredDirs,
    });
  }

  /**
   * Compute similarity ratio between two strings using a simple line-based approach.
   * Returns 0-1 where 1 = identical.
   */
  private computeSimilarity(a: string, b: string): number {
    const linesA = a.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const linesB = b.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    if (linesA.length < MIN_LINES || linesB.length < MIN_LINES) return 0;
    if (linesA.length === linesB.length && linesA.every((l, i) => l === linesB[i])) {
      return 1.0;
    }

    // Jaccard similarity on lines
    const setA = new Set(linesA);
    const setB = new Set(linesB);
    let intersection = 0;
    for (const line of setA) {
      if (setB.has(line)) intersection++;
    }
    const union = new Set([...setA, ...setB]).size;
    return union > 0 ? intersection / union : 0;
  }
}
