/**
 * EvidenceIndexWriter — produces TURPAN_EVIDENCE_INDEX.md
 *
 * Indexes all files in the run directory by kind:
 *   logs · screenshots · traces · json artifacts · patch files
 *
 * Falls back gracefully when files are missing.
 */

import { join }          from 'path';
import { createRequire } from 'module';
import type { TurpanAnalysisData, EvidenceFile, EvidenceIndex } from './types.js';

export class EvidenceIndexWriter {
  constructor(private data: TurpanAnalysisData) {}

  async write(runPath: string): Promise<string> {
    const { writeFileSync } = await import('fs');
    const content = this.render();
    const dest    = join(runPath, 'TURPAN_EVIDENCE_INDEX.md');
    writeFileSync(dest, content, 'utf-8');
    return dest;
  }

  render(): string {
    const { runPath, findings } = this.data;
    const files = this.gatherFiles(runPath);
    const index = this.categorise(files);

    const lines: string[] = [
      '# Evidence Index',
      '',
      `**Run:** ${this.data.runId}`,
      `**Total evidence files:** ${files.length}`,
      '',
    ];

    const sections: Array<[string, EvidenceFile[]]> = [
      ['Logs',        index.logs],
      ['Screenshots', index.screenshots],
      ['Traces',      index.traces],
      ['JSON Files',  index.jsonFiles],
      ['Patch Files', index.patchFiles],
      ['Other',       index.other],
    ];

    for (const [label, sectionFiles] of sections) {
      if (sectionFiles.length === 0) continue;
      lines.push(`## ${label}`, '');
      lines.push(`| File | Size |`, '|------|------|');
      for (const f of sectionFiles) {
        const sizeKb = f.size > 0 ? `${(f.size / 1024).toFixed(1)} KB` : '—';
        lines.push(`| \`${f.label}\` | ${sizeKb} |`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /** Return the categorised index object (used by other writers). */
  build(): EvidenceIndex {
    const files = this.gatherFiles(this.data.runPath);
    return this.categorise(files);
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private gatherFiles(runPath: string): EvidenceFile[] {
    try {
      const fs   = createRequire(import.meta.url)('fs');
      const { readdirSync, statSync } = fs;
      const entries = readdirSync(runPath, { recursive: true }) as string[];
      const files: EvidenceFile[] = [];

      for (const entry of entries) {
        if (typeof entry !== 'string') continue;
        const fullPath = join(runPath, entry);
        let size = 0;
        try { size = statSync(fullPath).size; } catch { /* skip */ }
        const kind = classifyFile(entry);
        if (kind) {
          files.push({ label: entry, path: fullPath, size, kind });
        }
      }
      return files;
    } catch {
      return [];
    }
  }

  private categorise(files: EvidenceFile[]): EvidenceIndex {
    return {
      logs:        files.filter(f => f.kind === 'log'),
      screenshots: files.filter(f => f.kind === 'screenshot'),
      traces:      files.filter(f => f.kind === 'trace'),
      jsonFiles:   files.filter(f => f.kind === 'json'),
      patchFiles:  files.filter(f => f.kind === 'patch'),
      other:       files.filter(f => f.kind === 'other'),
    };
  }
}

function classifyFile(path: string): string {
  const lc = path.toLowerCase();
  if (lc.includes('/logs/') || lc.endsWith('.log'))       return 'log';
  if (lc.endsWith('.png') || lc.endsWith('.jpg') || lc.endsWith('.jpeg')) return 'screenshot';
  if (lc.endsWith('.trace') || lc.endsWith('.perf') || lc.endsWith('.profile')) return 'trace';
  if (lc.endsWith('.json'))                                  return 'json';
  if (lc.endsWith('.diff') || lc.endsWith('.patch'))        return 'patch';
  return '';
}