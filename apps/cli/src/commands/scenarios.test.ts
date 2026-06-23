/**
 * Tests for `scenarios` CLI command — Phase 27 Authenticated SaaS scenarios.
 *
 * Validates:
 * - `scenarios test-auth` reports testUser/billing status safely
 * - `scenarios test-auth` NEVER includes password in output
 * - `scenarios list` includes all Phase 27 scenarios
 * - `scenarios inspect` shows risk level correctly
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Command } from 'commander';
import { scenarioRegistry } from '@turpan/ui-runner';

// We test the scenarios command module structure
import { createScenariosCommand } from './scenarios.js';

function makeTempProject(): string {
  const dir = join(tmpdir(), `turpan-scenarios-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeTurpanYml(projectPath: string, content: string): void {
  writeFileSync(join(projectPath, 'turpan.yml'), content, 'utf-8');
}

describe('scenarios CLI command (Phase 27)', () => {
  describe('scenarios list', () => {
    it('includes all Phase 27 authenticated scenarios', () => {
      const scenarios = scenarioRegistry.list();
      const ids = scenarios.map(s => s.id);
      expect(ids).toContain('next-saas-auth-good');
      expect(ids).toContain('next-saas-dashboard-empty');
      expect(ids).toContain('next-saas-settings-noop-save');
      expect(ids).toContain('next-saas-billing-test-mode');
      expect(ids).toContain('next-saas-admin-unprotected-authenticated');
    });

    it('command module exports createScenariosCommand', () => {
      const cmd = createScenariosCommand();
      expect(cmd).toBeInstanceOf(Command);
      expect(cmd.name()).toBe('scenarios');
    });

    it('command has test-auth subcommand', () => {
      const cmd = createScenariosCommand();
      const subcommands = cmd.commands.map(c => c.name());
      expect(subcommands).toContain('test-auth');
    });
  });

  describe('scenarios inspect', () => {
    it('returns a valid Command', () => {
      const cmd = createScenariosCommand();
      const inspect = cmd.commands.find(c => c.name() === 'inspect');
      expect(inspect).toBeDefined();
    });
  });

  describe('scenarios test-auth', () => {
    let projectPath: string;

    beforeEach(() => {
      projectPath = makeTempProject();
    });

    afterEach(() => {
      try { rmSync(projectPath, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    /**
     * Helper: run a subcommand and capture its console.log output.
     * Uses --project option to avoid process.chdir() (which is not supported in vitest workers).
     */
    async function runTestAuth(projectPath: string, args: string[] = []): Promise<string> {
      const cmd = createScenariosCommand();
      const testAuth = cmd.commands.find(c => c.name() === 'test-auth');
      expect(testAuth).toBeDefined();

      const originalLog = console.log;
      const output: string[] = [];
      console.log = (...a: unknown[]) => {
        output.push(a.map(String).join(' '));
      };

      try {
        await testAuth?.parseAsync(['--project', projectPath, ...args], { from: 'user' });
      } catch {
        // ignore commander parse errors for non-matching flags
      }

      console.log = originalLog;
      return output.join('\n');
    }

    it('reports DRY-RUN when no turpan.yml is present', async () => {
      const output = await runTestAuth(projectPath);
      expect(output).toContain('DRY-RUN');
      // CRITICAL: password must NEVER appear in output
      expect(output).not.toContain('TurpanTest123!');
      expect(output).not.toContain('passwordStored: true');
    });

    it('reports ENABLED when testUser.enabled is true', async () => {
      writeTurpanYml(projectPath, `
ui:
  testUser:
    enabled: true
    email: "qa-test@example.com"
    password: "qa-pass-123"
    seedCommand: "pnpm seed:test-user"
    loginPath: "/login"
    dashboardPath: "/dashboard"
  billing:
    testMode: true
    checkoutEndpoint: "/api/test-checkout"
`);
      const output = await runTestAuth(projectPath);
      expect(output).toContain('ENABLED');
      expect(output).toContain('qa-test@example.com');
      expect(output).toContain('/api/test-checkout');
      // CRITICAL: password must NEVER appear in output
      expect(output).not.toContain('qa-pass-123');
      expect(output).not.toContain('TurpanTest123!');
    });

    it('--json output does not include password', async () => {
      writeTurpanYml(projectPath, `
ui:
  testUser:
    enabled: true
    email: "qa-test@example.com"
    password: "supersecret123"
    seedCommand: ""
    loginPath: "/login"
    dashboardPath: "/dashboard"
`);
      const output = await runTestAuth(projectPath, ['--json']);
      // CRITICAL: JSON output must not include password
      expect(output).not.toContain('supersecret123');
      expect(output).not.toContain('"password"');
      // But should include the passwordStored: false flag
      expect(output).toContain('passwordStored');
      expect(output).toContain('false');
    });

    it('lists all Phase 27 authenticated scenarios in test-auth output', async () => {
      const output = await runTestAuth(projectPath);
      expect(output).toContain('next-saas-auth-good');
      expect(output).toContain('next-saas-dashboard-empty');
      expect(output).toContain('next-saas-settings-noop-save');
      expect(output).toContain('next-saas-billing-test-mode');
      expect(output).toContain('next-saas-admin-unprotected-authenticated');
    });
  });

  describe('Phase 27 safety guarantees', () => {
    it('all authenticated scenarios are registered with appropriate risk levels', () => {
      const riskMap = new Map<string, string>();
      for (const s of scenarioRegistry.list()) {
        if (s.id.startsWith('next-saas-')) {
          riskMap.set(s.id, s.riskLevel);
        }
      }

      // Admin scenarios are medium risk (security implications)
      expect(riskMap.get('next-saas-admin-unprotected-authenticated')).toBe('medium');
      // Auth scenarios are low risk (with testUser gating)
      expect(riskMap.get('next-saas-auth-good')).toBe('low');
      // Settings is safe (inspection only)
      expect(riskMap.get('next-saas-settings-noop-save')).toBe('safe');
      // Dashboard is safe (post-login inspection)
      expect(riskMap.get('next-saas-dashboard-empty')).toBe('safe');
      // Billing test mode is low risk (local endpoint only)
      expect(riskMap.get('next-saas-billing-test-mode')).toBe('low');
    });
  });
});
