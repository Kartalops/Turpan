/**
 * SaaS Plugin — specialized review skills for SaaS applications.
 *
 * Contributes:
 *  - SaaS route expectations (pricing, login, register, dashboard, settings, billing)
 *  - SaaS interaction scenario templates
 *  - Auth flow analysis
 *  - Multi-tenancy checks
 */

import { readFileSync } from 'fs';
import type { Plugin, PluginManifest, PluginUIScenario } from '../../Plugin.js';
import type { PluginContext } from '../../PluginContext.js';
import type { PluginRegistry } from '../../PluginRegistry.js';
import type { ProjectFingerprint } from '../../../project/index.js';
import type { Finding, Category } from '../../../findings/Finding.js';
import type { Analyzer, AnalyzerContext } from '../../../analyzers/Analyzer.js';
import { walkFiles } from '../../../shared/index.js';
import { confidence } from '../../../findings/Finding.js';

// ── Manifest ──────────────────────────────────────────────────────────────────

const manifest: PluginManifest = {
  id: 'saas',
  name: 'SaaS Review Skills',
  version: '0.1.0',
  description: 'Specialized analyzers for SaaS apps: route expectations, auth flows, billing UX, multi-tenancy',
  dependsOn: [],
};

// ── Expected SaaS Routes ──────────────────────────────────────────────────────

const EXPECTED_SAAS_ROUTES = [
  { path: '/', label: 'Home/Landing' },
  { path: '/pricing', label: 'Pricing' },
  { path: '/login', label: 'Login' },
  { path: '/register', label: 'Register' },
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/settings', label: 'Settings' },
  { path: '/billing', label: 'Billing' },
];

// ── Plugin ─────────────────────────────────────────────────────────────────────

export const saasPlugin: Plugin = {
  manifest,

  supports(fp: ProjectFingerprint): boolean {
    const hasAuth = fp.authHints && fp.authHints.length > 0;
    const hasRoutes = fp.routeHints && fp.routeHints.length > 0;
    const hasSaaSFiles = fp.detectedFiles?.some(f =>
      /dashboard|settings|billing|pricing|login|register|account/i.test(f)
    ) ?? false;

    return Boolean(hasAuth || hasRoutes || hasSaaSFiles);
  },

  register(registry: PluginRegistry, _ctx: PluginContext): void {
    registry.registerAnalyzer(createSaaSAnalyzer(), manifest.id);

    // Register SaaS interaction scenarios
    for (const scenario of SaaS_SCENARIOS) {
      registry.registerUIScenario(scenario, manifest.id);
    }

    // Register SaaS ruleset
    registry.registerRuleset({
      id: 'saas',
      label: 'SaaS Application Rules',
      additive: true,
      rules: `\
saas-routes:
  expected:
    - path: /
      label: Home/Landing
    - path: /pricing
      label: Pricing
    - path: /login
      label: Login
    - path: /register
      label: Register
    - path: /dashboard
      label: Dashboard
    - path: /settings
      label: Settings
    - path: /billing
      label: Billing
  severity: medium

auth-flows:
  require-auth:
    - /dashboard
    - /settings
    - /billing
  severity: high

billing-ux:
  requires-card-upfront: false
  show-plan-before-card: true
  severity: medium
`,
    }, manifest.id);
  },
};

// ── SaaS Analyzer ─────────────────────────────────────────────────────────────

function createSaaSAnalyzer(): Analyzer {
  return {
    id: 'saas-specific',
    name: 'SaaS Specific Analyzer',
    categories: ['saas', 'auth', 'ux', 'routes'],

    supports(): boolean {
      return true; // Always applicable; route checks are conditional
    },

    async run(ctx: AnalyzerContext): Promise<{
      analyzerId: string;
      findings: Finding[];
      artifacts?: Record<string, unknown>;
      durationMs: number;
      errors: string[];
    }> {
      const start = Date.now();
      const findings: Finding[] = [];
      const artifacts: Record<string, unknown> = {};

      try {
        const routeFiles = walkFiles({
          cwd: ctx.projectRoot,
          extensions: ['ts', 'tsx', 'js', 'jsx', 'py', 'go'],
          ignoreDirs: new Set(['node_modules', '.git', '.next', 'dist', 'build']),
          maxDepth: 4,
        });

        // Check for presence of key SaaS routes
        const foundRoutes: string[] = [];
        const missingRoutes: string[] = [];

        for (const expected of EXPECTED_SAAS_ROUTES) {
          const normalized = expected.path.replace('/', '');
          const found = routeFiles.some(f => {
            const lower = f.toLowerCase();
            return (
              lower.includes(normalized.toLowerCase()) ||
              lower.includes(expected.label.toLowerCase())
            );
          });

          if (found) {
            foundRoutes.push(expected.path);
          } else {
            missingRoutes.push(expected.path);
          }
        }

        artifacts['foundSaaSRoutes'] = foundRoutes;
        artifacts['missingSaaSRoutes'] = missingRoutes;

        // Report missing routes as findings
        if (missingRoutes.length > 0 && missingRoutes.length < 4) {
          findings.push({
            id: 'saas-missing-routes',
            title: `Missing common SaaS routes: ${missingRoutes.join(', ')}`,
            severity: 'medium',
            category: 'security' as Category,
            explanation:
              `Expected SaaS routes not found: ${missingRoutes.join(', ')}. ` +
              `SaaS applications typically include these routes for complete user journeys.`,
            evidence: [],
            fixable: 'manual',
            confidence: confidence(75),
            tags: ['saas', 'ux', 'routes'],
          });
        }

        // Check for auth protection on sensitive routes
        const sensitivePatterns = ['dashboard', 'settings', 'billing', 'account', 'profile'];
        const unprotectedSensitive: string[] = [];
        for (const file of routeFiles) {
          if (!sensitivePatterns.some(pattern => file.toLowerCase().includes(pattern))) continue;
          if (/auth|login/i.test(file)) continue;
          let content: string;
          try { content = readFileSync(file, 'utf-8'); } catch { continue; }
          const hasGuard = /(?:getServerSession|requireAuth|requireRole|authorize|session\.user|cookies\s*\(\).*get\s*\(\s*['"]auth)/is.test(content);
          if (!hasGuard) unprotectedSensitive.push(file);
        }

        if (unprotectedSensitive.length > 0) {
          findings.push({
            id: 'saas-unprotected-routes',
            title: `${unprotectedSensitive.length} sensitive route(s) may lack auth protection`,
            severity: 'high',
            category: 'security' as Category,
            explanation:
              'Sensitive routes like dashboard, settings, or billing should check for authentication ' +
              'before rendering. Without auth checks, unauthenticated users may access private data.',
            evidence: [],
            fixable: 'manual',
            confidence: confidence(70),
            tags: ['saas', 'auth', 'security'],
          });
        }

        // Check for pricing page with CTA
        if (!foundRoutes.includes('/pricing') && !missingRoutes.includes('/pricing')) {
          findings.push({
            id: 'saas-missing-pricing',
            title: 'No pricing page found',
            severity: 'medium',
            category: 'performance' as Category,
            explanation:
              'SaaS apps should have a clear pricing page. If you are running a SaaS, ' +
              'add a /pricing route with plan details and CTAs.',
            evidence: [],
            fixable: 'manual',
            confidence: confidence(80),
            tags: ['saas', 'ux', 'conversion'],
          });
        }

      } catch (err) {
        return {
          analyzerId: 'saas-specific',
          findings: [],
          durationMs: Date.now() - start,
          errors: [err instanceof Error ? err.message : String(err)],
        };
      }

      return {
        analyzerId: 'saas-specific',
        findings,
        artifacts,
        durationMs: Date.now() - start,
        errors: [],
      };
    },
  };
}

// ── SaaS Interaction Scenarios ────────────────────────────────────────────────

const SaaS_SCENARIOS: PluginUIScenario[] = [
  {
    id: 'saas.onboarding',
    label: 'SaaS New User Onboarding',
    category: 'saas.onboarding',
    steps: [
      { action: 'navigate', target: '/register', expect: 'registration-form' },
      { action: 'fill', target: 'email', expect: 'valid-input' },
      { action: 'fill', target: 'password', expect: 'valid-password' },
      { action: 'click', target: 'submit', expect: 'dashboard' },
      { action: 'navigate', target: '/dashboard', expect: 'dashboard-loaded' },
    ],
  },
  {
    id: 'saas.pricing-cto',
    label: 'Pricing Page CTA Flow',
    category: 'saas.pricing',
    steps: [
      { action: 'navigate', target: '/pricing', expect: 'pricing-plans' },
      { action: 'click', target: 'plan-button', expect: 'checkout-cta' },
      { action: 'click', target: 'checkout', expect: 'payment-form' },
    ],
  },
  {
    id: 'saas.settings-flow',
    label: 'User Settings Update',
    category: 'saas.settings',
    steps: [
      { action: 'navigate', target: '/login', expect: 'login-form' },
      { action: 'navigate', target: '/settings', expect: 'settings-page' },
      { action: 'fill', target: 'display-name', expect: 'input-filled' },
      { action: 'click', target: 'save', expect: 'success-toast' },
    ],
  },
];
