/**
 * FindingStore — in-memory store for all findings collected during a review run
 */

import type { Finding, Severity, Category } from './Finding.js';

export class FindingStore {
  private _findings: Finding[] = [];

  add(finding: Finding): void {
    this._findings.push(finding);
  }

  addMany(findings: Finding[]): void {
    this._findings.push(...findings);
  }

  get all(): readonly Finding[] {
    return this._findings;
  }

  get count(): number {
    return this._findings.length;
  }

  clear(): void {
    this._findings = [];
  }

  /** Filter by severity */
  withSeverity(severity: Severity): Finding[] {
    return this._findings.filter(f => f.severity === severity);
  }

  /** Filter by category */
  withCategory(category: Category): Finding[] {
    return this._findings.filter(f => f.category === category);
  }

  /** Filter to only fixable findings */
  fixable(): Finding[] {
    return this._findings.filter(f => f.fixable !== 'none');
  }

  /** Filter to findings above a minimum confidence */
  withMinConfidence(min: number): Finding[] {
    return this._findings.filter(f => f.confidence >= min);
  }

  /** Filter by file */
  withFile(file: string): Finding[] {
    return this._findings.filter(f => f.file === file);
  }

  /** Sort by severity desc, then confidence desc */
  sortedBySeverity(): Finding[] {
    const order: Record<Severity, number> = {
      critical: 0, high: 1, medium: 2, low: 3, info: 4,
    };
    return [...this._findings].sort((a, b) => {
      const sd = order[a.severity] - order[b.severity];
      return sd !== 0 ? sd : b.confidence - a.confidence;
    });
  }

  /** Group by category */
  byCategory(): Map<Category, Finding[]> {
    const map = new Map<Category, Finding[]>();
    for (const f of this._findings) {
      const list = map.get(f.category) ?? [];
      list.push(f);
      map.set(f.category, list);
    }
    return map;
  }

  /** Group by severity */
  bySeverity(): Map<Severity, Finding[]> {
    const map = new Map<Severity, Finding[]>();
    for (const f of this._findings) {
      const list = map.get(f.severity) ?? [];
      list.push(f);
      map.set(f.severity, list);
    }
    return map;
  }

  /** Returns all unique files that have findings */
  affectedFiles(): string[] {
    return [...new Set(this._findings.filter(f => f.file).map(f => f.file!))];
  }

  toJSON(): Finding[] {
    return this._findings;
  }
}
