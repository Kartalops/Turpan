/**
 * ReportOpenCommand — opens the Turpan Analysis HTML report in the browser.
 *
 * Usage:
 *   ReportOpenCommand.open()           — open latest run's HTML report
 *   ReportOpenCommand.open('/path/to/run-dir')  — open specific run
 *
 * Falls back to markdown if HTML not yet generated.
 */

import { join, resolve } from 'path';
import { existsSync }    from 'fs';

const HTML_FILE = 'TURPAN_ANALYSIS.html';
const MD_FILE   = 'TURPAN_ANALYSIS.md';

export class ReportOpenCommand {
  /**
   * Open the report for the given run directory.
   * Returns the path that was opened, or undefined if nothing found.
   */
  static async open(runDir?: string): Promise<string | undefined> {
    const open = (await import('open')).default;

    const target = runDir ?? this.latestRunPath();
    if (!target) {
      console.error('❌ No run directory found. Run `turpan` first.');
      return undefined;
    }

    const htmlPath = join(target, HTML_FILE);
    const mdPath   = join(target, MD_FILE);

    if (existsSync(htmlPath)) {
      await open(htmlPath, { wait: false });
      console.log(`✅ Opened: ${htmlPath}`);
      return htmlPath;
    }

    if (existsSync(mdPath)) {
      await open(mdPath, { wait: false });
      console.log(`✅ Opened: ${mdPath}`);
      return mdPath;
    }

    console.error(`❌ No report found in ${target}`);
    return undefined;
  }

  /** Print the path to the latest run's report (no open). */
  static show(): string | undefined {
    const latest = this.latestRunPath();
    if (!latest) {
      console.log('No run found. Run `turpan` first.');
      return undefined;
    }

    const htmlPath = join(latest, HTML_FILE);
    const mdPath   = join(latest, MD_FILE);

    if (existsSync(htmlPath)) {
      console.log(`📄 ${htmlPath}`);
      return htmlPath;
    }
    if (existsSync(mdPath)) {
      console.log(`📄 ${mdPath}`);
      return mdPath;
    }

    console.log(`No report found in ${latest}`);
    return undefined;
  }

  /** Resolve the path to `.turpan/runs/latest` */
  static latestRunPath(): string | undefined {
    const { TURPAN_RUNS = '.turpan/runs' } = process.env;
    const latest = join(TURPAN_RUNS, 'latest');
    return existsSync(latest) ? latest : undefined;
  }

  /** Resolve a specific run by ID or 'latest'. */
  static resolveRunPath(idOrLatest: string): string {
    const { TURPAN_RUNS = '.turpan/runs' } = process.env;
    if (idOrLatest === 'latest') {
      return join(TURPAN_RUNS, 'latest');
    }
    // Try as exact path first
    if (existsSync(idOrLatest)) return idOrLatest;
    // Try as run ID under runs/
    return join(TURPAN_RUNS, idOrLatest);
  }
}