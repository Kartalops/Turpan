/**
 * AnalyzerRegistry — tracks and discovers available analyzers
 */

import type { Analyzer, AnalyzerContext, AnalyzerResult } from './Analyzer.js';
import type { ProjectFingerprint } from '../project/index.js';

export class AnalyzerRegistry {
  private analyzers = new Map<string, Analyzer>();

  register(analyzer: Analyzer): void {
    if (this.analyzers.has(analyzer.id)) {
      throw new Error(`Analyzer "${analyzer.id}" is already registered`);
    }
    this.analyzers.set(analyzer.id, analyzer);
  }

  unregister(id: string): void {
    this.analyzers.delete(id);
  }

  get(id: string): Analyzer | undefined {
    return this.analyzers.get(id);
  }

  listAll(): Analyzer[] {
    return [...this.analyzers.values()];
  }

  /** Returns all analyzers that support the given fingerprint */
  applicableTo(fingerprint: ProjectFingerprint): Analyzer[] {
    return this.listAll().filter(a => a.supports(fingerprint));
  }

  /** Run all applicable analyzers for a project */
  async runApplicable(
    fingerprint: ProjectFingerprint,
    ctx: Omit<AnalyzerContext, 'fingerprint'>
  ): Promise<AnalyzerResult[]> {
    const applicable = this.applicableTo(fingerprint);
    const results: AnalyzerResult[] = [];

    for (const analyzer of applicable) {
      if (ctx.signal?.aborted) break;
      const start = Date.now();
      try {
        const result = await analyzer.run({
          ...ctx,
          fingerprint,
        });
        results.push({
          ...result,
          analyzerId: analyzer.id,
          durationMs: Date.now() - start,
        });
      } catch (err) {
        results.push({
          analyzerId: analyzer.id,
          findings: [],
          durationMs: Date.now() - start,
          errors: [err instanceof Error ? err.message : String(err)],
        });
      }
    }

    return results;
  }

  /** Group results by category */
  groupByCategory(results: AnalyzerResult[]): Map<string, AnalyzerResult[]> {
    const map = new Map<string, AnalyzerResult[]>();
    for (const result of results) {
      const analyzer = this.get(result.analyzerId);
      if (!analyzer) continue;
      for (const cat of analyzer.categories) {
        const list = map.get(cat) ?? [];
        list.push(result);
        map.set(cat, list);
      }
    }
    return map;
  }
}

// Singleton registry instance
export const globalRegistry = new AnalyzerRegistry();
