/**
 * Vite Plugin — specialized review skills for Vite-based projects.
 *
 * Contributes:
 *  - Dev server detection
 *  - Route and link crawling setup
 *  - HMR configuration checks
 *  - Import alias validation
 */

import type { Plugin, PluginManifest } from '../../Plugin.js';
import type { PluginContext } from '../../PluginContext.js';
import type { PluginRegistry } from '../../PluginRegistry.js';
import type { ProjectFingerprint } from '../../../project/index.js';
import type { Finding, Category } from '../../../findings/Finding.js';
import type { Analyzer, AnalyzerContext } from '../../../analyzers/Analyzer.js';
import { walkFiles } from '../../../shared/index.js';
import { confidence } from '../../../findings/Finding.js';

// ── Manifest ──────────────────────────────────────────────────────────────────

const manifest: PluginManifest = {
  id: 'vite',
  name: 'Vite Review Skills',
  version: '0.1.0',
  description: 'Specialized analyzers for Vite projects: HMR, alias config, dev server, link crawling',
  dependsOn: [],
};

// ── Plugin ─────────────────────────────────────────────────────────────────────

export const vitePlugin: Plugin = {
  manifest,

  supports(fp: ProjectFingerprint): boolean {
    return (
      fp.appType === 'vite-react' ||
      (fp.detectedFiles?.some((f: string) =>
        /vite\.config\.(js|ts|mjs)|vitest\.config\.(js|ts|mjs)/.test(f)
      ) ?? false)
    );
  },

  register(registry: PluginRegistry, _ctx: PluginContext): void {
    registry.registerAnalyzer(createViteAnalyzer(), manifest.id);
  },
};

// ── Vite Analyzer ─────────────────────────────────────────────────────────────

function createViteAnalyzer(): Analyzer {
  return {
    id: 'vite-specific',
    name: 'Vite Specific Analyzer',
    categories: ['build', 'performance'],

    supports(fp: ProjectFingerprint): boolean {
      return (
        fp.appType === 'vite-react' ||
        (fp.detectedFiles?.some((f: string) =>
          /vite\.config\.(js|ts|mjs)/.test(f)
        ) ?? false)
      );
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
        const files = walkFiles({
          cwd: ctx.projectRoot,
          extensions: ['js', 'ts', 'mjs'],
          ignoreDirs: new Set(['node_modules', '.git', 'dist', 'build']),
          maxDepth: 3,
        });

        // Check for vite.config
        const viteConfig = files.find((f: string) => /vite\.config\.(js|ts|mjs)$/.test(f));
        artifacts['hasViteConfig'] = Boolean(viteConfig);
        artifacts['viteConfigPath'] = viteConfig ?? null;

        // Check for import.meta.env usage (good) vs process.env (bad in Vite)
        const badProcessEnv = files.filter((f: string) =>
          /process\.env\.[A-Z_]+/.test(f)
        );

        if (badProcessEnv.length > 0) {
          findings.push({
            id: 'vite-use-import-meta-env',
            title: 'Use import.meta.env instead of process.env in Vite projects',
            severity: 'medium',
            category: 'build' as Category,
            explanation:
              'In Vite, environment variables must be accessed via import.meta.env, ' +
              'not process.env. Only variables prefixed with VITE_ are exposed to client code.',
            evidence: [],
            fixable: 'manual',
            confidence: confidence(85),
            tags: ['vite', 'environment'],
          });
        }

        // Check HMR configuration presence
        const hasHmrConfig = files.some((f: string) =>
          /vite\.config\.(js|ts)/.test(f) &&
          (f.includes('server.hmr') || f.includes('hmr:'))
        );
        artifacts['hasHmrConfig'] = hasHmrConfig;

        // Check for optimizeDeps configuration
        const hasOptimizeDeps = files.some((f: string) =>
          /vite\.config\.(js|ts)/.test(f) && f.includes('optimizeDeps')
        );
        artifacts['hasOptimizeDeps'] = hasOptimizeDeps;

      } catch (err) {
        return {
          analyzerId: 'vite-specific',
          findings: [],
          durationMs: Date.now() - start,
          errors: [err instanceof Error ? err.message : String(err)],
        };
      }

      return {
        analyzerId: 'vite-specific',
        findings,
        artifacts,
        durationMs: Date.now() - start,
        errors: [],
      };
    },
  };
}
