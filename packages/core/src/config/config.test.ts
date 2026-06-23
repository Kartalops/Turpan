/**
 * Tests for the config loader and saver.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadConfig, saveConfig, createDefaultConfig, parseYaml, stringifyYaml, ConfigParseError } from './index.js';

describe('config', () => {
  describe('loadConfig', () => {
    let tmpDir: string;
    beforeAll(() => {
      tmpDir = join(tmpdir(), `turpan-config-${Date.now()}`);
      mkdirSync(tmpDir, { recursive: true });
    });
    afterAll(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it('returns defaults when no config exists', () => {
      const config = loadConfig(tmpDir);
      expect(config.version).toBe('0.1.0');
      expect(config.deepAnalysis).toBe(false);
      expect(config.runPath).toContain('.turpan/runs');
    });

    it('parses a basic YAML config', () => {
      writeFileSync(join(tmpDir, 'turpan.yml'), `
version: 0.2.0
deepAnalysis: true
uiAnalysis: true
logLevel: debug
`);
      const config = loadConfig(tmpDir);
      expect(config.version).toBe('0.2.0');
      expect(config.deepAnalysis).toBe(true);
      expect(config.uiAnalysis).toBe(true);
      expect(config.logLevel).toBe('debug');
    });

    it('parses project metadata', () => {
      writeFileSync(join(tmpDir, 'turpan.yml'), `
project:
  name: my-cool-app
`);
      const config = loadConfig(tmpDir);
      expect(config.project?.name).toBe('my-cool-app');
    });

    it('parses command overrides', () => {
      writeFileSync(join(tmpDir, 'turpan.yml'), `
commands:
  install: npm install --legacy-peer-deps
  build: npm run build
  test: npm test
`);
      const config = loadConfig(tmpDir);
      expect(config.commands?.install).toBe('npm install --legacy-peer-deps');
      expect(config.commands?.build).toBe('npm run build');
    });

    it('parses UI config', () => {
      writeFileSync(join(tmpDir, 'turpan.yml'), `
ui:
  enabled: true
  baseUrl: http://localhost:4000
  scenarios: [auth, billing]
  viewports: [mobile]
`);
      const config = loadConfig(tmpDir);
      expect(config.ui?.enabled).toBe(true);
      expect(config.ui?.baseUrl).toBe('http://localhost:4000');
      expect(config.ui?.scenarios).toEqual(['auth', 'billing']);
      expect(config.ui?.viewports).toEqual(['mobile']);
    });

    it('parses fix config', () => {
      writeFileSync(join(tmpDir, 'turpan.yml'), `
fix:
  mode: patch-only
  maxFilesChanged: 3
  allowDependencyChanges: true
`);
      const config = loadConfig(tmpDir);
      expect(config.fix?.mode).toBe('patch-only');
      expect(config.fix?.maxFilesChanged).toBe(3);
      expect(config.fix?.allowDependencyChanges).toBe(true);
    });

    it('parses security config', () => {
      writeFileSync(join(tmpDir, 'turpan.yml'), `
security:
  redactSecrets: true
`);
      const config = loadConfig(tmpDir);
      expect(config.security?.redactSecrets).toBe(true);
    });

    it('parses plugins', () => {
      writeFileSync(join(tmpDir, 'turpan.yml'), `
plugins: [saas, mcp, next]
`);
      const config = loadConfig(tmpDir);
      expect(config.plugins).toEqual(['saas', 'mcp', 'next']);
    });

    it('parses ignore paths', () => {
      writeFileSync(join(tmpDir, 'turpan.yml'), `
ignore:
  paths: [vendor, legacy]
  globs: [*.bak, *.tmp]
`);
      const config = loadConfig(tmpDir);
      expect(config.ignore?.paths).toEqual(['vendor', 'legacy']);
      expect(config.ignore?.globs).toEqual(['*.bak', '*.tmp']);
    });

    it('falls back to defaults on malformed YAML', () => {
      writeFileSync(join(tmpDir, 'turpan.yml'), 'this is not: valid: yaml: at all:\n  - broken');
      const config = loadConfig(tmpDir);
      // Should return defaults without throwing
      expect(config.version).toBe('0.1.0');
    });

    it('falls back to defaults on missing file', () => {
      rmSync(join(tmpDir, 'turpan.yml'), { force: true });
      const config = loadConfig(tmpDir);
      expect(config.version).toBe('0.1.0');
    });
  });

  describe('createDefaultConfig', () => {
    let tmpDir: string;
    beforeAll(() => {
      tmpDir = join(tmpdir(), `turpan-cfg-create-${Date.now()}`);
      mkdirSync(tmpDir, { recursive: true });
    });
    afterAll(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it('creates a config with the new structured format', () => {
      const config = createDefaultConfig(tmpDir);
      expect(config.project?.name).toBeTruthy();
      expect(config.commands).toBeDefined();
      expect(config.ui).toBeDefined();
      expect(config.fix).toBeDefined();
      expect(config.fix?.mode).toBe('report-only');
      expect(config.fix?.maxFilesChanged).toBe(5);
      expect(config.security?.redactSecrets).toBe(true);
      expect(config.ignore).toBeDefined();

      // Verify file was written
      expect(existsSync(join(tmpDir, 'turpan.yml'))).toBe(true);
    });
  });

  describe('parseYaml', () => {
    it('parses top-level scalars', () => {
      const result = parseYaml('version: 1.0.0\nname: foo\ncount: 5\nactive: true\n');
      expect(result['version']).toBe('1.0.0');
      expect(result['name']).toBe('foo');
      expect(result['count']).toBe(5);
      expect(result['active']).toBe(true);
    });

    it('parses nested objects', () => {
      const result = parseYaml(`
project:
  name: foo
  version: 2
`);
      const project = result['project'] as Record<string, unknown>;
      expect(project['name']).toBe('foo');
      expect(project['version']).toBe(2);
    });

    it('parses inline lists', () => {
      const result = parseYaml('plugins: [saas, mcp, next]');
      expect(result['plugins']).toEqual(['saas', 'mcp', 'next']);
    });

    it('parses block lists', () => {
      const result = parseYaml(`
plugins:
  - saas
  - mcp
  - next
`);
      expect(result['plugins']).toEqual(['saas', 'mcp', 'next']);
    });

    it('handles comments', () => {
      const result = parseYaml(`
# this is a comment
version: 1.0.0 # inline comment
`);
      expect(result['version']).toBe('1.0.0');
    });

    it('parses quoted strings', () => {
      const result = parseYaml('name: "hello world"\nother: \'single\'\n');
      expect(result['name']).toBe('hello world');
      expect(result['other']).toBe('single');
    });
  });

  describe('stringifyYaml', () => {
    it('round-trips a config object', () => {
      const config = {
        version: '1.0.0',
        deepAnalysis: true,
        logLevel: 'info',
      };
      const yaml = stringifyYaml(config);
      const parsed = parseYaml(yaml);
      expect(parsed['version']).toBe('1.0.0');
      expect(parsed['deepAnalysis']).toBe(true);
      expect(parsed['logLevel']).toBe('info');
    });

    it('serializes nested objects', () => {
      const config = {
        project: { name: 'foo' },
        commands: { build: 'npm run build' },
      };
      const yaml = stringifyYaml(config);
      expect(yaml).toContain('project:');
      expect(yaml).toContain('  name: foo');
      expect(yaml).toContain('commands:');
      expect(yaml).toContain('  build: npm run build');
    });
  });
});
