import { describe, it, expect } from 'vitest';
import { parseCommand } from './intent.js';

/**
 * Safety behavior tests — verify that dangerous-sounding commands
 * default to safe/read-only behavior.
 */

describe('Safety Behavior', () => {
  describe('"clean code" must not delete files directly', () => {
    it('"clean unused code" maps to cleanup_review (report action)', () => {
      const result = parseCommand('clean unused code');
      // cleanup_review action is 'report' — scan and propose, never delete
      expect(result.intent).toBe('cleanup_review');
    });

    it('"remove unused code" maps to cleanup_review (report action)', () => {
      const result = parseCommand('remove unused code');
      expect(result.intent).toBe('cleanup_review');
    });

    it('"dead code" maps to cleanup_review (report action)', () => {
      const result = parseCommand('dead code');
      expect(result.intent).toBe('cleanup_review');
    });

    it('"cleanup" maps to clean (report action)', () => {
      const result = parseCommand('cleanup');
      expect(result.intent).toBe('clean');
    });
  });

  describe('"fix" without apply should not modify files', () => {
    it('"fix issues" maps to fix (patch-only action)', () => {
      const result = parseCommand('fix issues');
      expect(result.intent).toBe('fix');
    });

    it('"fix safe issues" maps to fix_safe (patch action)', () => {
      const result = parseCommand('fix safe issues');
      expect(result.intent).toBe('fix_safe');
    });

    it('"improve code quality" maps to fix (patch-only)', () => {
      const result = parseCommand('improve code quality');
      expect(result.intent).toBe('fix');
    });

    it('"improve code quality" without --apply is NOT apply_fix', () => {
      const result = parseCommand('improve code quality');
      expect(result.intent).not.toBe('apply_fix');
    });
  });

  describe('"fix --apply" required for file modifications', () => {
    it('"fix --apply" maps to apply_fix', () => {
      const result = parseCommand('fix --apply');
      expect(result.intent).toBe('apply_fix');
    });

    it('"apply fix" maps to apply_fix', () => {
      const result = parseCommand('apply fix');
      expect(result.intent).toBe('apply_fix');
    });

    it('"apply patch" maps to apply_fix', () => {
      const result = parseCommand('apply patch');
      expect(result.intent).toBe('apply_fix');
    });
  });

  describe('ambiguous commands default to report-only (safest behavior)', () => {
    it('unrecognized command maps to unknown (report action)', () => {
      const result = parseCommand('do something weird and ambiguous');
      expect(result.intent).toBe('unknown');
    });

    it('empty-like input returns unknown', () => {
      const result = parseCommand('   ');
      // Whitespace-only should still route to unknown after trim
      expect(result.intent).toBe('unknown');
    });
  });

  describe('patch-only mode prevents auto-apply', () => {
    it('"patch only" maps to patch_only', () => {
      const result = parseCommand('patch only');
      expect(result.intent).toBe('patch_only');
    });

    it('"plan patch" maps to patch_only', () => {
      const result = parseCommand('plan patch');
      expect(result.intent).toBe('patch_only');
    });

    it('"generate patch" maps to patch_only', () => {
      const result = parseCommand('generate patch');
      expect(result.intent).toBe('patch_only');
    });

    it('"propose fix" maps to patch_only', () => {
      const result = parseCommand('propose fix');
      expect(result.intent).toBe('patch_only');
    });
  });

  describe('show_findings and show_scorecard require prior run', () => {
    it('"show findings" maps to show_findings', () => {
      const result = parseCommand('show findings');
      expect(result.intent).toBe('show_findings');
    });

    it('"show scorecard" maps to show_scorecard', () => {
      const result = parseCommand('show scorecard');
      expect(result.intent).toBe('show_scorecard');
    });
  });
});