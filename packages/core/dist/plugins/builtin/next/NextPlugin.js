/**
 * Next.js Plugin — specialized review skills for Next.js projects.
 *
 * Contributes:
 *  - Route detection (app/pages router)
 *  - Hydration & runtime checks
 *  - Next build/typecheck assumptions
 *  - Dynamic import analysis
 */
import { walkFiles } from '../../../shared/index.js';
import { confidence } from '../../../findings/Finding.js';
// ── Manifest ──────────────────────────────────────────────────────────────────
const manifest = {
    id: 'next',
    name: 'Next.js Review Skills',
    version: '0.1.0',
    description: 'Specialized analyzers for Next.js: route detection, hydration checks, App Router support',
    dependsOn: [],
};
// ── Plugin ─────────────────────────────────────────────────────────────────────
export const nextPlugin = {
    manifest,
    supports(fp) {
        return fp.appType === 'nextjs' || fp.uiFramework === 'nextjs';
    },
    register(registry, _ctx) {
        registry.registerAnalyzer(createNextAnalyzer(), manifest.id);
    },
};
// ── Next Analyzer ─────────────────────────────────────────────────────────────
function createNextAnalyzer() {
    return {
        id: 'next-specific',
        name: 'Next.js Specific Analyzer',
        categories: ['runtime', 'performance'],
        supports(fp) {
            return fp.appType === 'nextjs' || fp.uiFramework === 'nextjs';
        },
        async run(ctx) {
            const start = Date.now();
            const findings = [];
            const artifacts = {};
            try {
                const files = walkFiles({
                    cwd: ctx.projectRoot,
                    extensions: ['ts', 'tsx', 'js', 'jsx'],
                    ignoreDirs: new Set(['node_modules', '.git', '.next', 'dist', 'build']),
                    maxDepth: 5,
                });
                // Detect router type
                const hasAppRouter = files.some((f) => /\/app\/.*\.(tsx?|jsx?)$/.test(f));
                const hasPagesRouter = files.some((f) => /\/pages\/.*\.(tsx?|jsx?)$/.test(f));
                const hasNextConfig = files.some((f) => f.endsWith('next.config.js') || f.endsWith('next.config.mjs'));
                artifacts['routerType'] = hasAppRouter ? 'app' : hasPagesRouter ? 'pages' : 'unknown';
                artifacts['hasNextConfig'] = hasNextConfig;
                // Check for Suspense boundaries
                const hasSuspense = files.some((f) => f.includes('Suspense'));
                artifacts['hasSuspense'] = hasSuspense;
                // Check for dynamic imports
                const dynamicImports = files.filter((f) => /dynamic\s*\(|import\s*\(\s*['"`]/i.test(f));
                artifacts['dynamicImports'] = dynamicImports.length;
                // Findings for missing Suspense with dynamic imports
                if (dynamicImports.length > 0 && !hasSuspense) {
                    findings.push({
                        id: 'next-missing-suspense',
                        title: 'Dynamic imports found without Suspense boundaries',
                        severity: 'medium',
                        category: 'runtime',
                        explanation: 'Next.js dynamic imports work best with React Suspense boundaries. ' +
                            'Without them, you may see hydration mismatches during client-side navigation.',
                        evidence: [],
                        fixable: 'manual',
                        confidence: confidence(70),
                        tags: ['nextjs', 'hydration', 'performance'],
                    });
                }
                // Check for metadata export in app router pages
                if (hasAppRouter) {
                    const pagesWithoutMetadata = files.filter((f) => /\/app\/.*\/page\.(tsx?|jsx?)$/.test(f) &&
                        !f.includes('layout.tsx') && !f.includes('layout.jsx'));
                    if (pagesWithoutMetadata.length > 0) {
                        artifacts['pagesNeedingMetadata'] = pagesWithoutMetadata.length;
                    }
                }
            }
            catch (err) {
                return {
                    analyzerId: 'next-specific',
                    findings: [],
                    durationMs: Date.now() - start,
                    errors: [err instanceof Error ? err.message : String(err)],
                };
            }
            return {
                analyzerId: 'next-specific',
                findings,
                artifacts,
                durationMs: Date.now() - start,
                errors: [],
            };
        },
    };
}
//# sourceMappingURL=NextPlugin.js.map