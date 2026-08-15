import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  ApiAgent,
  ArtifactBuilder,
  BootDiscovery,
  BrowserAgent,
  CliAgent,
  HealthDetector,
  ReproductionPlanner,
  RuntimeCorrelator,
  RuntimeSupervisor,
  SafeExplorationPolicy,
  type BrowserObservation,
  type SemanticBrowser,
  type UiAction,
} from '../src/runtime/index.js';
import type { FindingCandidate } from '../src/protocol/index.js';

describe('autonomous runtime exploration foundation', () => {
  it('RuntimeSupervisor owns resources and cleans them in reverse order', async () => {
    const cleaned: string[] = [];
    const supervisor = new RuntimeSupervisor('run-33');
    supervisor.register({ id: 'server', kind: 'dev-server', label: 'vite', cleanup: () => cleaned.push('server') });
    supervisor.register({ id: 'browser', kind: 'browser-session', label: 'chromium', cleanup: () => cleaned.push('browser') });

    expect(supervisor.list()).toHaveLength(2);
    await supervisor.cleanup();

    expect(cleaned).toEqual(['browser', 'server']);
    expect(supervisor.list()).toHaveLength(0);
    expect(supervisor.eventLog().some((event) => event.message.includes('cleaned'))).toBe(true);
  });

  it('BootDiscovery ranks known boot candidates without executing commands', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'turpan-boot-'));
    try {
      writeFileSync(join(tmp, 'package.json'), JSON.stringify({
        scripts: {
          dev: 'vite --host 127.0.0.1',
          start: 'node server.js',
          danger: 'rm -rf /',
        },
      }));
      writeFileSync(join(tmp, 'pnpm-lock.yaml'), '');

      const candidates = new BootDiscovery().discover(tmp);

      expect(candidates[0].id).toBe('package:dev');
      expect(candidates[0].command).toBe('pnpm run dev');
      expect(candidates.some((candidate) => candidate.command.includes('rm -rf'))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('HealthDetector uses readiness signals rather than fixed sleeps', async () => {
    const result = await new HealthDetector().detect({
      stdout: 'VITE v5 ready in 100 ms\nLocal: http://localhost:5173',
      processAlive: true,
    });

    expect(result.ready).toBe(true);
    expect(result.signals.map((signal) => signal.kind)).toContain('stdout');
  });

  it('SafeExplorationPolicy classifies safe, review-required, and forbidden actions', () => {
    const policy = new SafeExplorationPolicy();

    expect(policy.classify(action('nav', 'Dashboard')).risk).toBe('SAFE');
    expect(policy.classify(action('save', 'Save settings')).risk).toBe('REVIEW_REQUIRED');
    expect(policy.classify(action('delete', 'Delete account permanently')).risk).toBe('FORBIDDEN');
    expect(policy.classify(action('pay', 'Real purchase checkout')).risk).toBe('FORBIDDEN');
  });

  it('BrowserAgent builds a bounded semantic UI state graph and skips unsafe actions', async () => {
    const browser = new MemoryBrowser({
      '/': observation('/', [
        action('to-dashboard', 'Dashboard', '/dashboard'),
        action('delete', 'Delete account permanently', '/danger'),
      ]),
      '/dashboard': observation('/dashboard', [
        action('to-settings', 'Settings', '/settings'),
      ]),
      '/settings': observation('/settings', []),
    });

    const graph = await new BrowserAgent(browser).explore('/', { maxStates: 3 });

    expect(graph.visitedRoutes).toEqual(['/', '/dashboard', '/settings']);
    expect(graph.transitions.some((transition) => transition.to === '/danger')).toBe(false);
  });

  it('ReproductionPlanner creates concrete runtime strategies for known bug classes', () => {
    const save = new ReproductionPlanner().plan(candidate({
      title: 'Save button is no-op',
      explanation: 'Settings changes do not persist after reload.',
    }));
    const admin = new ReproductionPlanner().plan(candidate({
      title: 'Admin route lacks authorization',
      explanation: 'Admin page is visible without auth.',
    }));

    expect(save.steps.map((step) => step.action)).toContain('inspect network activity for save request');
    expect(admin.steps.map((step) => step.action)).toContain('open admin route unauthenticated');
  });

  it('ApiAgent discovers safe local API endpoints from Next handlers and Express routes', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'turpan-api-'));
    try {
      mkdirSync(join(tmp, 'app', 'api', 'users'), { recursive: true });
      writeFileSync(join(tmp, 'app', 'api', 'users', 'route.ts'), [
        'export async function GET() { return Response.json([]); }',
        'export async function POST() { return Response.json({ ok: true }); }',
      ].join('\n'));
      mkdirSync(join(tmp, 'src'), { recursive: true });
      writeFileSync(join(tmp, 'src', 'server.ts'), "app.get('/health', handler); app.delete('/users/:id', handler);");

      const plan = new ApiAgent().discover(tmp);

      expect(plan.endpoints.some((endpoint) => endpoint.method === 'GET' && endpoint.path === '/api/users')).toBe(true);
      expect(plan.endpoints.some((endpoint) => endpoint.method === 'DELETE' && endpoint.safeToCall === false)).toBe(true);
      expect(plan.boundaryTests.every((test) => test.endpoint.safeToCall)).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('CliAgent closes the broken-help gap with safe command probes', () => {
    const plan = new CliAgent().plan('turpan');
    expect(plan.commands.map((cmd) => cmd.args.join(' '))).toContain('--help');
    expect(plan.commands.map((cmd) => cmd.args.join(' '))).toContain('--version');
    expect(plan.commands.some((cmd) => cmd.args.includes('--definitely-invalid-option'))).toBe(true);
  });

  it('RuntimeCorrelator maps runtime evidence back to likely source files', () => {
    const correlation = new RuntimeCorrelator().correlate(
      { kind: 'trace', excerpt: 'Error at SettingsPage.tsx:42' },
      [{ path: 'src/SettingsPage.tsx', content: 'export function SettingsPage() {}' }],
    );

    expect(correlation.sourceEvidence?.path).toBe('src/SettingsPage.tsx');
    expect(correlation.confidence).toBeGreaterThan(70);
  });

  it('ArtifactBuilder redacts secrets from runtime evidence and metadata', () => {
    const githubToken = ['gh', 'p_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'].join('');
    const sanitized = new ArtifactBuilder().sanitize({
      runId: 'run-33',
      reproductionSteps: [{ action: 'open page' }],
      commandHistory: [],
      screenshots: [],
      networkEvidence: [{ kind: 'network', excerpt: 'Authorization: Bearer secretsecretsecret' }],
      consoleEvidence: [{ kind: 'console', excerpt: 'TOKEN=abcdef1234567890' }],
      logs: [{ kind: 'command-log', excerpt: `GITHUB_TOKEN=${githubToken}` }],
      sourceLocations: [],
      environment: { API_KEY: 'abcdef1234567890', NODE_ENV: 'test' },
    });

    expect(JSON.stringify(sanitized)).not.toContain('ghp_');
    expect(JSON.stringify(sanitized)).not.toContain('abcdef1234567890');
  });
});

function action(id: string, accessibleName: string, destination?: string): UiAction {
  return {
    id,
    kind: 'click',
    element: {
      role: 'button',
      accessibleName,
      nearbyText: accessibleName,
      destination,
    },
  };
}

function observation(route: string, actions: UiAction[]): BrowserObservation {
  return {
    route,
    title: route,
    actions,
    consoleErrors: [],
    networkErrors: [],
  };
}

function candidate(overrides: Partial<FindingCandidate>): FindingCandidate {
  return {
    title: 'runtime issue',
    severity: 'high',
    category: 'runtime',
    confidence: 75,
    explanation: 'runtime issue',
    evidence: [{ kind: 'text', excerpt: 'hypothesis' }],
    ...overrides,
  };
}

class MemoryBrowser implements SemanticBrowser {
  private current = '/';

  constructor(private readonly pages: Record<string, BrowserObservation>) {}

  async openPage(url: string): Promise<BrowserObservation> {
    this.current = url;
    return this.pages[url];
  }

  async inspectPage(): Promise<BrowserObservation> {
    return this.pages[this.current];
  }

  async click(action: UiAction): Promise<BrowserObservation> {
    this.current = action.element?.destination ?? this.current;
    return this.pages[this.current];
  }

  async type(): Promise<BrowserObservation> { return this.inspectPage(); }
  async select(): Promise<BrowserObservation> { return this.inspectPage(); }
  async submit(): Promise<BrowserObservation> { return this.inspectPage(); }
  async back(): Promise<BrowserObservation> { this.current = '/'; return this.inspectPage(); }
  async reload(): Promise<BrowserObservation> { return this.inspectPage(); }
  async waitFor(): Promise<BrowserObservation> { return this.inspectPage(); }
  async readConsole(): Promise<string[]> { return []; }
  async readNetwork(): Promise<BrowserObservation['networkErrors']> { return []; }
  async takeScreenshot(): Promise<string> { return 'screenshot.png'; }
  async getAccessibilityTree(): Promise<unknown> { return {}; }
}
