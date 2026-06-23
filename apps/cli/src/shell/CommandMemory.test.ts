import { describe, it, expect, beforeEach } from 'vitest';
import { CommandMemory } from './CommandMemory.js';
import type { Finding, Scorecard } from '@turpan/shared';

describe('CommandMemory', () => {
  const makeFinding = (overrides: Partial<Finding> = {}): Finding => ({
    id: 'f1',
    title: 'Test Finding',
    severity: 'medium',
    category: 'test',
    explanation: 'Test explanation',
    evidence: [],
    fixable: 'none',
    confidence: 80,
    tags: [],
    ...overrides,
  });

  const makeScorecard = (overrides: Partial<Scorecard> = {}): Scorecard => ({
    overall: 75,
    categories: {
      correctness: 80,
      security: 70,
      performance: 75,
      maintainability: 70,
      codeCoverage: 60,
    },
    findingsCount: 5,
    criticalIssues: 0,
    ...overrides,
  });

  let memory: CommandMemory;

  beforeEach(() => {
    memory = new CommandMemory();
  });

  describe('run memory', () => {
    it('starts with no lastRunId', () => {
      expect(memory.lastRunId).toBeNull();
    });

    it('stores and retrieves lastRunId', () => {
      memory.setLastRun('run-123');
      expect(memory.lastRunId).toBe('run-123');
    });

    it('stores run metadata', () => {
      memory.setLastRun('run-456', {
        timestamp: '2024-01-01T00:00:00Z',
        projectPath: '/test/path',
        analysisType: 'deep_review',
        status: 'completed',
        duration: 5000,
      });
      expect(memory.lastRunMetadata?.id).toBe('run-456');
      expect(memory.lastRunMetadata?.analysisType).toBe('deep_review');
      expect(memory.lastRunMetadata?.duration).toBe(5000);
    });
  });

  describe('findings memory', () => {
    it('stores and retrieves findings', () => {
      const findings = [makeFinding({ id: 'f1' }), makeFinding({ id: 'f2' })];
      memory.setFindings(findings);
      expect(memory.lastFindings).toHaveLength(2);
      expect(memory.lastFindings[0].id).toBe('f1');
    });

    it('starts with empty findings', () => {
      expect(memory.lastFindings).toHaveLength(0);
    });

    it('stores and retrieves scorecard', () => {
      const scorecard = makeScorecard({ overall: 85 });
      memory.setScorecard(scorecard);
      expect(memory.lastScorecard?.overall).toBe(85);
    });

    it('starts with null scorecard', () => {
      expect(memory.lastScorecard).toBeNull();
    });
  });

  describe('command history', () => {
    it('starts empty', () => {
      expect(memory.getHistory()).toHaveLength(0);
    });

    it('pushes commands to history newest-first', () => {
      memory.pushHistory('first');
      memory.pushHistory('second');
      memory.pushHistory('third');
      // Newest first
      expect(memory.getHistory()).toEqual(['third', 'second', 'first']);
    });

    it('avoids consecutive duplicates', () => {
      memory.pushHistory('review');
      memory.pushHistory('fix');
      memory.pushHistory('review'); // not consecutive (there's 'fix' in between)
      expect(memory.getHistory()).toEqual(['review', 'fix', 'review']);
    });

    it('caps history at 100 entries', () => {
      for (let i = 0; i < 105; i++) {
        memory.pushHistory(`command-${i}`);
      }
      const history = memory.getHistory();
      expect(history).toHaveLength(100);
      expect(history[0]).toBe('command-104');
    });

    it('does not push empty commands', () => {
      memory.pushHistory('');
      memory.pushHistory('   ');
      memory.pushHistory('real-command');
      expect(memory.getHistory()).toEqual(['real-command']);
    });

    it('getPreviousCommand navigates backward (newest-first order)', () => {
      memory.pushHistory('first');
      memory.pushHistory('second');
      memory.pushHistory('third');

      // History newest-first: ['third', 'second', 'first']
      // index=-1 initially, first prev returns index 0 = 'third'
      expect(memory.getPreviousCommand()).toBe('third');
      expect(memory.getPreviousCommand()).toBe('second');
      expect(memory.getPreviousCommand()).toBe('first');
      expect(memory.getPreviousCommand()).toBe('first'); // stops at oldest
    });

    it('getNextCommand navigates forward after getPreviousCommand', () => {
      memory.pushHistory('first');
      memory.pushHistory('second');
      memory.pushHistory('third');

      // Go backward to oldest
      memory.getPreviousCommand(); // third
      memory.getPreviousCommand(); // second
      memory.getPreviousCommand(); // first

      // Now go forward — each call advances one position
      expect(memory.getNextCommand()).toBe('second');
      expect(memory.getNextCommand()).toBe('third');
      expect(memory.getNextCommand()).toBe(''); // at newest, exhausted
      expect(memory.getNextCommand()).toBe(''); // stays exhausted
    });

    it('resetHistoryIndex resets navigation index', () => {
      memory.pushHistory('first');
      memory.pushHistory('second');
      memory.pushHistory('third');

      memory.getPreviousCommand(); // third
      memory.getPreviousCommand(); // second
      memory.resetHistoryIndex();
      // After reset, getNext starts at the newest again
      expect(memory.getNextCommand()).toBe('third');
      expect(memory.getNextCommand()).toBe(''); // now exhausted
    });

    it('reset clears run state but preserves history', () => {
      memory.pushHistory('review');
      memory.pushHistory('fix');
      memory.setLastRun('run-1');
      memory.setFindings([makeFinding()]);
      memory.setScorecard(makeScorecard());
      memory.setProjectStarted(true);

      memory.reset();

      expect(memory.lastRunId).toBeNull();
      expect(memory.lastFindings).toHaveLength(0);
      expect(memory.lastScorecard).toBeNull();
      expect(memory.projectStarted).toBe(false);
      // history is preserved (but reset to a fresh copy)
      expect(memory.getHistory()).toHaveLength(2);
      expect(memory.getHistory()).toEqual(['fix', 'review']);
    });

    it('reset preserves history but creates fresh run state', () => {
      memory.pushHistory('cmd1');
      memory.setLastRun('run-x');
      memory.reset();
      // reset() clears run state but keeps history array intact
      expect(memory.lastRunId).toBeNull();
      expect(memory.getHistory()).toEqual(['cmd1']);
      memory.pushHistory('cmd2');
      expect(memory.getHistory()).toEqual(['cmd2', 'cmd1']);
    });
  });

  describe('mode tracking', () => {
    it('starts with default mode', () => {
      expect(memory.selectedMode).toBe('review');
    });

    it('changes and retrieves selected mode', () => {
      memory.setMode('security');
      expect(memory.selectedMode).toBe('security');
    });
  });

  describe('project started', () => {
    it('starts as false', () => {
      expect(memory.projectStarted).toBe(false);
    });

    it('sets and retrieves project started state', () => {
      memory.setProjectStarted(true);
      expect(memory.projectStarted).toBe(true);
    });
  });

  describe('reset', () => {
    it('reset does not affect other instances', () => {
      const mem1 = new CommandMemory();
      const mem2 = new CommandMemory();
      mem1.pushHistory('cmd1');
      mem1.setLastRun('run-1');
      mem1.reset();
      // mem2 should be unaffected
      expect(mem2.getHistory()).toHaveLength(0);
      expect(mem2.lastRunId).toBeNull();
    });
  });

  describe('toJSON', () => {
    it('returns snapshot with commandCount', () => {
      memory.pushHistory('test');
      const snapshot = memory.toJSON();
      expect(snapshot.commandCount).toBe(1);
      expect((snapshot as { commandHistory?: unknown }).commandHistory).toBeUndefined();
    });
  });
});