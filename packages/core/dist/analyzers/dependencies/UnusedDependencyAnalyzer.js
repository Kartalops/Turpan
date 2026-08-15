/**
 * Unused Dependency Analyzer
 * Compares package.json dependencies to actual import/require usage in source files.
 * Conservative: only reports dependencies with zero usage references.
 */
import { createFinding, confidence } from '../../findings/Finding.js';
import { createEvidence } from '../../findings/Evidence.js';
import { readFile } from 'fs/promises';
import { join, relative } from 'path';
import { walkFiles } from '../../shared/index.js';
/** Packages that are almost never actually "unused" — framework staples */
const ALWAYS_USED = new Set([
    'typescript', '@types/node', '@types/react', '@types/react-dom',
    'react', 'react-dom', 'next', 'vite', 'webpack', 'esbuild',
    'ts-node', 'tsx', 'vitest', 'jest', 'playwright', '@playwright/test',
    'eslint', 'prettier', 'stylelint', 'tailwindcss', 'postcss',
    '@babel/core', 'babel-loader', 'css-loader', 'style-loader',
    'node-fetch', 'cross-fetch', 'axios',
    // Known framework packages that are commonly imported dynamically or hoisted
    'dist', 'build', 'lib', 'src', 'app', 'pages', 'components',
]);
export class UnusedDependencyAnalyzer {
    id = 'unused-dependency';
    name = 'Unused Dependency Analyzer';
    categories = ['dependency'];
    supports(fp) {
        return (fp.packageManager !== 'unknown' &&
            fp.languages.some(language => ['typescript', 'javascript'].includes(language.toLowerCase())));
    }
    async run(ctx) {
        const errors = [];
        const findings = [];
        const packageJsonPath = join(ctx.projectRoot, 'package.json');
        let pkgJson;
        try {
            const content = await readFile(packageJsonPath, 'utf-8');
            pkgJson = JSON.parse(content);
        }
        catch {
            return {
                analyzerId: this.id,
                findings: [],
                durationMs: 0,
                errors: ['Could not read package.json'],
            };
        }
        // Collect all deps
        const allDeps = new Map(Object.entries({ ...pkgJson.dependencies, ...pkgJson.devDependencies, ...pkgJson.peerDependencies }));
        if (allDeps.size === 0) {
            return { analyzerId: this.id, findings: [], durationMs: 0, errors: [] };
        }
        // Find all source files
        const srcFiles = await this.findSourceFiles(ctx.projectRoot);
        // Build usage map: depName -> Set of files referencing it
        const usage = new Map();
        for (const [dep, version] of allDeps) {
            if (ALWAYS_USED.has(dep))
                continue; // skip framework staples
            usage.set(dep, new Set());
        }
        // Scan each source file for import/require statements
        for (const file of srcFiles) {
            try {
                const content = await readFile(file, 'utf-8');
                const relPath = relative(ctx.projectRoot, file);
                for (const [dep] of allDeps) {
                    if (ALWAYS_USED.has(dep))
                        continue;
                    if (this.isUsedInContent(dep, content)) {
                        usage.get(dep).add(relPath);
                    }
                }
            }
            catch {
                // Skip unreadable files
            }
        }
        // Report unused deps
        for (const [dep, version] of allDeps) {
            if (ALWAYS_USED.has(dep))
                continue;
            const usedIn = usage.get(dep);
            if (usedIn.size === 0) {
                const isDev = pkgJson.devDependencies?.[dep] !== undefined;
                findings.push(createFinding({
                    id: `unused-dep-${dep}`,
                    title: `Unused dependency: ${dep}`,
                    explanation: `Package "${dep}" (${version}) appears to have no import/require references in the codebase.${isDev ? ' It is listed as a devDependency.' : ''}`,
                    severity: isDev ? 'low' : 'medium',
                    category: 'dependency',
                    fixable: 'manual',
                    confidence: confidence(85),
                    tags: ['unused-dependency', 'cleanup', isDev ? 'dev-dependency' : 'dependency'],
                    file: 'package.json',
                    evidence: [
                        createEvidence('file', {
                            path: packageJsonPath,
                            label: 'package.json',
                            excerpt: isDev
                                ? `"${dep}": "${version}" in devDependencies`
                                : `"${dep}": "${version}" in dependencies`,
                        }),
                    ],
                    suggestedFix: `Run \`npm uninstall ${dep}\` (or \`pnpm remove ${dep}\`, \`yarn remove ${dep}\`) to remove this unused dependency.`,
                }));
            }
        }
        return { analyzerId: this.id, findings, durationMs: 0, errors };
    }
    async findSourceFiles(projectRoot) {
        const ignoredDirs = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage', '.turpan']);
        return walkFiles({
            cwd: projectRoot,
            extensions: ['ts', 'tsx', 'js', 'jsx', 'mts', 'cts'],
            ignoreDirs: ignoredDirs,
        });
    }
    /** Check if a dependency is referenced in file content */
    isUsedInContent(dep, content) {
        // Handle scoped packages: @org/package
        const escaped = dep.replace('/', '\\/');
        // Match: import x from 'package' | import 'package' | require('package')
        const patterns = [
            // import statements
            new RegExp(`from\\s+['"]${escaped}['']`, 'g'),
            new RegExp(`import\\s+['"]${escaped}['']`, 'g'),
            // require
            new RegExp(`require\\s*\\(\\s*['"]${escaped}['']\\s*\\)`, 'g'),
            // dynamic import
            new RegExp(`import\\s*\\(\\s*['"]${escaped}['']\\s*\\)`, 'g'),
        ];
        return patterns.some(p => p.test(content));
    }
}
//# sourceMappingURL=UnusedDependencyAnalyzer.js.map