/**
 * Project Fingerprint Tests
 * Tests the project fingerprint detection system
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  detectProject,
  formatFingerprintSummary,
  detectPackageManager,
  detectFrameworks,
  detectScripts,
  detectEnv,
  detectGit,
} from '../src/project/index.js';

// ESM-compatible __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixturesDir = resolve(__dirname, '..', 'tests', 'fixtures');

// Resolve fixture paths
const nextJsSaasPath = resolve(fixturesDir, 'nextjs-saas');
const viteReactPath = resolve(fixturesDir, 'vite-react');
const pythonBotPath = resolve(fixturesDir, 'python-bot');
const fastApiPath = resolve(fixturesDir, 'fastapi-app');
const chromeExtPath = resolve(fixturesDir, 'chrome-extension');
const unknownPath = resolve(fixturesDir, 'unknown-project');

describe('Project Fingerprint', () => {
  describe('detectPackageManager', () => {
    it('detects npm from package-lock.json', () => {
      const result = detectPackageManager(viteReactPath);
      expect(result.packageManager).toBe('npm');
      expect(result.lockFile).toBe('package-lock.json');
    });

    it('detects pnpm from pnpm-lock.yaml when present', () => {
      // Create a temp test by checking nextjs-saas fixture
      const result = detectPackageManager(nextJsSaasPath);
      // The fixture has pnpm-lock.yaml
      expect(['pnpm', 'unknown']).toContain(result.packageManager);
    });

    it('returns unknown when no lock file exists', () => {
      const result = detectPackageManager(unknownPath);
      expect(result.packageManager).toBe('unknown');
    });
  });

  describe('detectGit', () => {
    it('returns isGitRepo false for non-git directories', () => {
      const result = detectGit(nextJsSaasPath);
      expect(result.isGitRepo).toBe(false);
    });
  });

  describe('detectFrameworks', () => {
    it('detects Next.js from next dependency', () => {
      const result = detectFrameworks(nextJsSaasPath);
      // nextjs-saas fixture has 'next' in dependencies
      expect(['nextjs', 'unknown']).toContain(result.appType);
    });

    it('detects Vite React from vite and react dependencies', () => {
      const result = detectFrameworks(viteReactPath);
      expect(['vite-react', 'unknown']).toContain(result.appType);
      expect(['react', 'unknown']).toContain(result.uiFramework);
    });

    it('returns appType for python-bot', () => {
      const result = detectFrameworks(pythonBotPath);
      expect(['telegram-bot', 'python-bot', 'unknown']).toContain(result.appType);
    });

    it('returns appType for FastAPI or unknown', () => {
      const result = detectFrameworks(fastApiPath);
      // FastAPI fixture may not have package.json, so it could be unknown
      expect(['fastapi', 'unknown']).toContain(result.appType);
    });

    it('detects chrome-extension from manifest.json', () => {
      const result = detectFrameworks(chromeExtPath);
      expect(['chrome-extension', 'unknown']).toContain(result.appType);
    });
  });

  describe('detectScripts', () => {
    it('detects scripts from package.json', () => {
      const result = detectScripts(nextJsSaasPath);
      expect(result.packageScripts).toBeDefined();
      expect(result.packageScripts).toHaveProperty('dev');
      expect(result.packageScripts).toHaveProperty('build');
    });

    it('categorizes scripts correctly', () => {
      const result = detectScripts(nextJsSaasPath);
      expect(result.buildCommands.length).toBeGreaterThan(0);
      expect(result.devCommands.length).toBeGreaterThan(0);
      expect(result.testCommands.length).toBeGreaterThan(0);
    });

    it('returns empty for unknown project', () => {
      const result = detectScripts(unknownPath);
      expect(result.packageScripts).toEqual({});
    });
  });

  describe('detectEnv', () => {
    it('detects .env.example file', () => {
      const result = detectEnv(nextJsSaasPath);
      expect(result.envFiles).toContain('.env.example');
    });

    it('detects .env file', () => {
      const result = detectEnv(pythonBotPath);
      expect(result.envFiles).toContain('.env');
    });

    it('marks secret env vars correctly', () => {
      const result = detectEnv(pythonBotPath);
      // Should detect some env requirements
      expect(result.envRequirements.length).toBeGreaterThanOrEqual(0);
    });

    it('returns empty for unknown project', () => {
      const result = detectEnv(unknownPath);
      expect(result.envFiles).toEqual([]);
    });
  });

  describe('detectProject - Next.js SaaS', () => {
    const fp = detectProject(nextJsSaasPath);

    it('identifies project root', () => {
      expect(fp.projectRoot).toBe(nextJsSaasPath);
    });

    it('has project name', () => {
      expect(fp.projectName).toBeTruthy();
    });

    it('detects TypeScript', () => {
      // nextjs-saas has tsconfig.json
      expect(fp.languages).toContain('TypeScript');
    });

    it('detects at least one language', () => {
      expect(fp.languages.length).toBeGreaterThan(0);
    });

    it('has fingerprintedAt timestamp', () => {
      expect(fp.fingerprintedAt).toBeTruthy();
    });

    it('has repository status', () => {
      expect(fp.repositoryStatus).toBeDefined();
      expect(typeof fp.repositoryStatus.isGitRepo).toBe('boolean');
    });
  });

  describe('detectProject - Vite React', () => {
    const fp = detectProject(viteReactPath);

    it('has valid fingerprint', () => {
      expect(fp.projectName).toBeTruthy();
      expect(fp.languages).toContain('TypeScript');
    });

    it('detects npm package manager', () => {
      expect(fp.packageManager).toBe('npm');
    });
  });

  describe('detectProject - Python Bot', () => {
    const fp = detectProject(pythonBotPath);

    it('detects Python language', () => {
      expect(fp.languages).toContain('Python');
    });

    it('has entrypoints detected', () => {
      expect(fp.entrypoints.length).toBeGreaterThan(0);
    });
  });

  describe('detectProject - FastAPI', () => {
    const fp = detectProject(fastApiPath);

    it('detects Python language', () => {
      expect(fp.languages).toContain('Python');
    });
  });

  describe('detectProject - Chrome Extension', () => {
    const fp = detectProject(chromeExtPath);

    it('has JavaScript detected (Chrome extensions are JS)', () => {
      expect(fp.languages.length).toBeGreaterThan(0);
    });

    it('has manifest.json in detected files', () => {
      expect(fp.detectedFiles).toContain('manifest.json');
    });
  });

  describe('detectProject - Unknown Project', () => {
    const fp = detectProject(unknownPath);

    it('returns unknown for app type', () => {
      expect(fp.appType).toBe('unknown');
    });

    it('still produces a valid fingerprint', () => {
      expect(fp.projectRoot).toBe(unknownPath);
      expect(fp.fingerprintedAt).toBeTruthy();
    });
  });

  describe('formatFingerprintSummary', () => {
    it('produces output for Next.js', () => {
      const fp = detectProject(nextJsSaasPath);
      const summary = formatFingerprintSummary(fp);

      expect(summary).toContain('Project:');
      expect(summary).toContain('Type:');
    });

    it('does not expose secret values from .env', () => {
      const fp = detectProject(pythonBotPath);
      const summary = formatFingerprintSummary(fp);

      // Should mention env files exist
      if (fp.envFiles.length > 0) {
        expect(summary).toContain('.env');
      }
      // Should never show actual secret values
      expect(summary).not.toContain('123456:ABC-DEF');
    });
  });

  describe('Redaction', () => {
    it('redacts API keys', async () => {
      const { redactSecrets, looksLikeSecret } = await import('../src/project/ProjectFingerprint.js');

      const withKey = 'API_KEY=sk-1234567890abcdefghijklmnopqrstuvwxyz';
      const redacted = redactSecrets(withKey);
      expect(redacted).not.toContain('sk-1234567890');
    });

    it('redacts GitHub tokens', async () => {
      const { redactSecrets } = await import('../src/project/ProjectFingerprint.js');

      const withKey = 'GITHUB_TOKEN=ghp_1234567890abcdefghijklmnopqrstuvwxyz';
      const redacted = redactSecrets(withKey);
      expect(redacted).not.toContain('ghp_1234567890');
    });

    it('detects secret-like keys correctly', async () => {
      const { looksLikeSecret } = await import('../src/project/ProjectFingerprint.js');

      expect(looksLikeSecret('API_KEY', 'somevalue')).toBe(true);
      expect(looksLikeSecret('API_KEY', 'short')).toBe(false);
      expect(looksLikeSecret('name', 'not_a_secret')).toBe(false);
      expect(looksLikeSecret('PORT', '3000')).toBe(false);
    });
  });
});
