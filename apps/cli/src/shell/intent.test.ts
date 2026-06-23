import { describe, it, expect } from 'vitest';
import { parseCommand, getIntentLabel, getAvailableCommands, getCommandCategories } from './intent.js';

describe('Intent Router', () => {
  describe('parseCommand', () => {
    // ── Deep / Quick Review ─────────────────────────────────────────────────
    it('parses "analyze this project deeply" as analyze', () => {
      const result = parseCommand('analyze this project deeply');
      expect(result.intent).toBe('analyze');
    });

    it('parses "deep review" as deep_review', () => {
      const result = parseCommand('deep review');
      expect(result.intent).toBe('deep_review');
    });

    it('parses "comprehensive review" as deep_review', () => {
      const result = parseCommand('comprehensive review');
      expect(result.intent).toBe('deep_review');
    });

    it('parses "quick review" as quick_review', () => {
      const result = parseCommand('quick review');
      expect(result.intent).toBe('quick_review');
    });

    it('parses "light review" as quick_review', () => {
      const result = parseCommand('light review');
      expect(result.intent).toBe('quick_review');
    });

    // ── UI / Runtime Review ─────────────────────────────────────────────────
    it('parses "ui review" as ui_review', () => {
      const result = parseCommand('ui review');
      expect(result.intent).toBe('ui_review');
    });

    it('parses "runtime review" as runtime_review', () => {
      const result = parseCommand('runtime review');
      expect(result.intent).toBe('runtime_review');
    });

    it('parses "run live UI test" as ui', () => {
      const result = parseCommand('run live UI test');
      expect(result.intent).toBe('ui');
    });

    // ── Code Quality / Cleanup ──────────────────────────────────────────────
    it('parses "code quality review" as code_quality_review', () => {
      const result = parseCommand('code quality review');
      expect(result.intent).toBe('code_quality_review');
    });

    it('parses "improve code quality" as fix (patch-only by default)', () => {
      const result = parseCommand('improve code quality');
      expect(result.intent).toBe('fix'); // patch-only by design
    });

    it('parses "cleanup review" as cleanup_review', () => {
      const result = parseCommand('cleanup review');
      expect(result.intent).toBe('cleanup_review');
    });

    it('parses "clean unused code" as cleanup_review', () => {
      const result = parseCommand('clean unused code');
      expect(result.intent).toBe('cleanup_review');
    });

    it('parses "remove unused code" as cleanup_review', () => {
      const result = parseCommand('remove unused code');
      expect(result.intent).toBe('cleanup_review');
    });

    it('parses "dead code" as cleanup_review', () => {
      const result = parseCommand('dead code');
      expect(result.intent).toBe('cleanup_review');
    });

    // ── Security / Agent Audit ──────────────────────────────────────────────
    it('parses "security review" as security_review', () => {
      const result = parseCommand('security review');
      expect(result.intent).toBe('security_review');
    });

    it('parses "agent output audit" as agent_output_audit', () => {
      const result = parseCommand('agent output audit');
      expect(result.intent).toBe('agent_output_audit');
    });

    it('parses "audit agent output" as agent_output_audit', () => {
      const result = parseCommand('audit agent output');
      expect(result.intent).toBe('agent_output_audit');
    });

    // ── Fix intents ─────────────────────────────────────────────────────────
    it('parses "fix safe issues" as fix_safe', () => {
      const result = parseCommand('fix safe issues');
      expect(result.intent).toBe('fix_safe');
    });

    it('parses "patch only" as patch_only', () => {
      const result = parseCommand('patch only');
      expect(result.intent).toBe('patch_only');
    });

    it('parses "fix --patch-only" as patch_only', () => {
      const result = parseCommand('fix --patch-only');
      expect(result.intent).toBe('patch_only');
    });

    it('parses "fix --apply" as apply_fix', () => {
      const result = parseCommand('fix --apply');
      expect(result.intent).toBe('apply_fix');
    });

    it('parses "apply fix" as apply_fix', () => {
      const result = parseCommand('apply fix');
      expect(result.intent).toBe('apply_fix');
    });

    it('parses "fix issues" as fix (patch-only)', () => {
      const result = parseCommand('fix issues');
      expect(result.intent).toBe('fix');
    });

    // ── Report intents ──────────────────────────────────────────────────────
    it('parses "generate Turpan Analysis" as generate_report', () => {
      const result = parseCommand('generate Turpan Analysis');
      expect(result.intent).toBe('generate_report');
    });

    it('parses "open report" as open_report', () => {
      const result = parseCommand('open report');
      expect(result.intent).toBe('open_report');
    });

    it('parses "show findings" as show_findings', () => {
      const result = parseCommand('show findings');
      expect(result.intent).toBe('show_findings');
    });

    it('parses "show scorecard" as show_scorecard', () => {
      const result = parseCommand('show scorecard');
      expect(result.intent).toBe('show_scorecard');
    });

    // ── Exit ────────────────────────────────────────────────────────────────
    it('parses exit commands as exit', () => {
      expect(parseCommand('exit').intent).toBe('exit');
      expect(parseCommand('quit').intent).toBe('exit');
      expect(parseCommand('q').intent).toBe('exit');
      expect(parseCommand('bye').intent).toBe('exit');
    });

    // ── Unknown ─────────────────────────────────────────────────────────────
    it('returns unknown for unrecognized commands', () => {
      expect(parseCommand('random garbage').intent).toBe('unknown');
      expect(parseCommand('do something weird').intent).toBe('unknown');
    });

    // ── Flags ───────────────────────────────────────────────────────────────
    it('extracts boolean flags correctly', () => {
      const result = parseCommand('review --deep --fix');
      expect(result.flags.deep).toBe(true);
      expect(result.flags.fix).toBe(true);
    });

    it('extracts value flags correctly', () => {
      const result = parseCommand('review --mode fast --depth 3');
      expect(result.flags.mode).toBe('fast');
      expect(result.flags.depth).toBe('3');
    });

    it('extracts positional args correctly', () => {
      const result = parseCommand('review src tests');
      expect(result.args).toEqual(['src', 'tests']);
    });

    it('preserves raw input', () => {
      const result = parseCommand('  analyze this project deeply  ');
      expect(result.raw).toBe('analyze this project deeply');
    });
  });

  describe('getIntentLabel', () => {
    it('returns correct labels for all intents', () => {
      expect(getIntentLabel('deep_review')).toBe('Deep Review');
      expect(getIntentLabel('quick_review')).toBe('Quick Review');
      expect(getIntentLabel('ui_review')).toBe('UI Review');
      expect(getIntentLabel('runtime_review')).toBe('Runtime Review');
      expect(getIntentLabel('code_quality_review')).toBe('Code Quality Review');
      expect(getIntentLabel('cleanup_review')).toBe('Cleanup Review');
      expect(getIntentLabel('security_review')).toBe('Security Review');
      expect(getIntentLabel('agent_output_audit')).toBe('Agent Output Audit');
      expect(getIntentLabel('fix_safe')).toBe('Safe Fix');
      expect(getIntentLabel('patch_only')).toBe('Patch Only');
      expect(getIntentLabel('apply_fix')).toBe('Apply Fix');
      expect(getIntentLabel('generate_report')).toBe('Generate Report');
      expect(getIntentLabel('open_report')).toBe('Open Report');
      expect(getIntentLabel('show_findings')).toBe('Show Findings');
      expect(getIntentLabel('show_scorecard')).toBe('Show Scorecard');
    });
  });

  describe('getAvailableCommands', () => {
    it('returns a non-empty list', () => {
      const commands = getAvailableCommands();
      expect(commands.length).toBeGreaterThan(0);
    });

    it('includes all major intent commands', () => {
      const commands = getAvailableCommands();
      expect(commands).toContain('analyze this project deeply');
      expect(commands).toContain('deep review');
      expect(commands).toContain('quick review');
      expect(commands).toContain('cleanup review');
      expect(commands).toContain('security review');
      expect(commands).toContain('fix --patch-only');
      expect(commands).toContain('fix --apply');
      expect(commands).toContain('exit');
    });
  });

  describe('getCommandCategories', () => {
    it('returns commands grouped by category', () => {
      const categories = getCommandCategories();
      expect(Object.keys(categories).length).toBeGreaterThan(0);
      expect(categories.Analysis).toBeDefined();
      expect(categories.Quality).toBeDefined();
      expect(categories.Fix).toBeDefined();
      expect(categories.Report).toBeDefined();
    });

    it('has exit in Meta category', () => {
      const categories = getCommandCategories();
      expect(categories.Meta).toContain('exit');
    });
  });
});