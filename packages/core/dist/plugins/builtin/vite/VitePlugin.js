/**
 * Vite Plugin — specialized review skills for Vite-based projects.
 *
 * Contributes:
 *  - Dev server detection
 *  - Route and link crawling setup
 *  - HMR configuration checks
 *  - Import alias validation
 */
import { walkFiles } from '../../../shared/index.js';
import { confidence } from '../../../findings/Finding.js';
// ── Manifest ──────────────────────────────────────────────────────────────────
const manifest = {
    id: 'vite',
    name: 'Vite Review Skills',
    version: '0.1.0',
    description: 'Specialized analyzers for Vite projects: HMR, alias config, dev server, link crawling',
    dependsOn: [],
};
// ── Plugin ─────────────────────────────────────────────────────────────────────
export const vitePlugin = {
    manifest,
    supports(fp) {
        return (fp.appType === 'vite-react' ||
            (fp.detectedFiles?.some((f) => /vite\.config\.(js|ts|mjs)|vitest\.config\.(js|ts|mjs)/.test(f)) ?? false));
    },
    register(registry, _ctx) {
        registry.registerAnalyzer(createViteAnalyzer(), manifest.id);
    },
};
// ── Vite Analyzer ─────────────────────────────────────────────────────────────
function createViteAnalyzer() {
    return {
        id: 'vite-specific',
        name: 'Vite Specific Analyzer',
        categories: ['build', 'performance'],
        supports(fp) {
            return (fp.appType === 'vite-react' ||
                (fp.detectedFiles?.some((f) => /vite\.config\.(js|ts|mjs)/.test(f)) ?? false));
        },
        async run(ctx) {
            const start = Date.now();
            const findings = [];
            const artifacts = {};
            try {
                const files = walkFiles({
                    cwd: ctx.projectRoot,
                    extensions: ['js', 'ts', 'mjs'],
                    ignoreDirs: new Set(['node_modules', '.git', 'dist', 'build']),
                    maxDepth: 3,
                });
                // Check for vite.config
                const viteConfig = files.find((f) => /vite\.config\.(js|ts|mjs)$/.test(f));
                artifacts['hasViteConfig'] = Boolean(viteConfig);
                artifacts['viteConfigPath'] = viteConfig ?? null;
                // Check for import.meta.env usage (good) vs process.env (bad in Vite)
                const badProcessEnv = files.filter((f) => /process\.env\.[A-Z_]+/.test(f));
                if (badProcessEnv.length > 0) {
                    findings.push({
                        id: 'vite-use-import-meta-env',
                        title: 'Use import.meta.env instead of process.env in Vite projects',
                        severity: 'medium',
                        category: 'build',
                        explanation: 'In Vite, environment variables must be accessed via import.meta.env, ' +
                            'not process.env. Only variables prefixed with VITE_ are exposed to client code.',
                        evidence: [],
                        fixable: 'manual',
                        confidence: confidence(85),
                        tags: ['vite', 'environment'],
                    });
                }
                // Check HMR configuration presence
                const hasHmrConfig = files.some((f) => /vite\.config\.(js|ts)/.test(f) &&
                    (f.includes('server.hmr') || f.includes('hmr:')));
                artifacts['hasHmrConfig'] = hasHmrConfig;
                // Check for optimizeDeps configuration
                const hasOptimizeDeps = files.some((f) => /vite\.config\.(js|ts)/.test(f) && f.includes('optimizeDeps'));
                artifacts['hasOptimizeDeps'] = hasOptimizeDeps;
            }
            catch (err) {
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
//# sourceMappingURL=VitePlugin.js.map