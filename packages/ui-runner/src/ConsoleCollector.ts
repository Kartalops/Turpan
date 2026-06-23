/**
 * ConsoleCollector — intercept and categorize browser console output.
 *
 * Distinguishes:
 * - Runtime errors (actual JS exceptions)
 * - Hydration errors (React Next.js mismatch)
 * - Warnings vs errors
 * - Logs from the app vs from external sources
 */

import type { Page } from 'playwright';
import type { ConsoleEntry } from './types.js';

const HYDRATION_PATTERNS = [
  'hydrat',
  'mismatch',
  'did not match',
  'server rendered',
  'hydration',
  'Text content does not match',
  'Expected server HTML',
];

const RUNTIME_ERROR_PATTERNS = [
  'Uncaught ',
  'ReferenceError',
  'TypeError',
  'SyntaxError',
  'RangeError',
  'URIError',
  'EvalError',
  'is not defined',
  'cannot read properties',
  'is not a function',
  'failed to fetch',
  'net::ERR_',
  'Fetch API cannot load',
];

export class ConsoleCollector {
  private entries: ConsoleEntry[] = [];
  private onEntry?: (entry: ConsoleEntry) => void;

  constructor(onEntry?: (entry: ConsoleEntry) => void) {
    this.onEntry = onEntry;
  }

  /**
   * Attach console listeners to a Playwright page.
   * Must be called before any navigation.
   */
  attach(page: Page): void {
    page.on('console', (msg) => {
      const entry = this.processMessage(msg);
      this.entries.push(entry);
      this.onEntry?.(entry);
    });

    page.on('pageerror', (err) => {
      const entry: ConsoleEntry = {
        type: 'error',
        text: err.message,
        url: page.url(),
        timestamp: new Date().toISOString(),
        isRuntimeError: true,
        isHydrationError: false,
      };
      this.entries.push(entry);
      this.onEntry?.(entry);
    });
  }

  private processMessage(msg: { type: () => string; text: () => string; location: () => { url?: string; lineNumber?: number; columnNumber?: number } }): ConsoleEntry {
    const type = msg.type() as ConsoleEntry['type'];
    const text = msg.text();
    const loc = msg.location();

    const isRuntimeError = type === 'error' && RUNTIME_ERROR_PATTERNS.some(p => text.includes(p));
    const isHydrationError = HYDRATION_PATTERNS.some(p => text.toLowerCase().includes(p.toLowerCase()));

    return {
      type,
      text,
      url: loc.url,
      line: loc.lineNumber,
      column: loc.columnNumber,
      timestamp: new Date().toISOString(),
      isRuntimeError,
      isHydrationError,
    };
  }

  getEntries(): ConsoleEntry[] { return [...this.entries]; }

  getErrors(): ConsoleEntry[] {
    return this.entries.filter(e => e.type === 'error' || e.isRuntimeError);
  }

  getRuntimeErrors(): ConsoleEntry[] {
    return this.entries.filter(e => e.isRuntimeError);
  }

  getHydrationErrors(): ConsoleEntry[] {
    return this.entries.filter(e => e.isHydrationError);
  }

  clear(): void { this.entries = []; }

  hasErrors(): boolean { return this.entries.some(e => e.type === 'error'); }

  summary(): { total: number; errors: number; warnings: number; runtime: number; hydration: number } {
    return {
      total: this.entries.length,
      errors: this.entries.filter(e => e.type === 'error').length,
      warnings: this.entries.filter(e => e.type === 'warning').length,
      runtime: this.getRuntimeErrors().length,
      hydration: this.getHydrationErrors().length,
    };
  }
}