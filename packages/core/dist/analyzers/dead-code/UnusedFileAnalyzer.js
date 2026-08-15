/**
 * Unused File Analyzer
 * Detects likely orphaned files (components/utils) that no other file imports.
 * Skips route files and config files.
 */
import { createFinding, confidence } from '../../findings/Finding.js';
import { createEvidence } from '../../findings/Evidence.js';
import { readFile } from 'fs/promises';
import { join, relative, basename } from 'path';
import { walkFiles } from '../../shared/index.js';
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage', '.turpan', '.vite', '__tests__', '__snapshots__', '.test.', '.spec.']);
const SKIP_PATTERNS = [
    // Route files (Next.js, Remix, etc.)
    /^[a-z]\[[a-z0-9]+\]\.[jt]sx?$/, // [slug].tsx
    /^_?[a-z]+\.[jt]sx?$/, // about.tsx, _app.tsx
    // Config files
    /^(\.|\w+)\.(config|rc|env|ignore|prettier|eslint|babel|tailwind|stylelint|gitignore|npmrc)$/,
    // Entry points
    /^index\.[jt]sx?$/,
    /^main\.[jt]sx?$/,
    /^entry\.[jt]sx?$/,
    /^App\.[jt]sx?$/,
    // Types/constants
    /^(types?|constants?|interfaces?|models?|schemas?)\.[jt]sx?$/,
    // Test files (but not the things they test)
    /\.(test|spec)\.[jt]sx?$/,
];
export class UnusedFileAnalyzer {
    id = 'unused-file';
    name = 'Unused File Analyzer';
    categories = ['dead-code'];
    supports(fp) {
        return (fp.appType !== 'unknown' ||
            fp.uiFramework !== 'none' ||
            fp.languages.some(language => ['typescript', 'javascript'].includes(language.toLowerCase())));
    }
    async run(ctx) {
        const errors = [];
        const findings = [];
        const candidateDirs = this.getCandidateDirs(ctx.fingerprint);
        const files = await this.findCandidateFiles(ctx.projectRoot, candidateDirs);
        if (files.length === 0) {
            return { analyzerId: this.id, findings: [], durationMs: 0, errors: [] };
        }
        // Build import graph
        const graph = await this.buildImportGraph(ctx.projectRoot, files);
        // Find orphaned files
        for (const file of files) {
            if (graph.importers.get(file)?.size === 0) {
                const relPath = relative(ctx.projectRoot, file);
                if (this.shouldSkip(relPath))
                    continue;
                findings.push(createFinding({
                    id: `unused-file-${relPath.replace(/[^a-z0-9]/gi, '-')}`,
                    title: `Unused file: dead/unwired component ${relPath}`,
                    explanation: `No other file imports "${basename(file)}". This file may be unused or incorrectly named/placed.`,
                    severity: 'low',
                    category: 'dead-code',
                    fixable: 'manual',
                    confidence: confidence(75),
                    tags: ['unused-file', 'dead-code', 'orphan'],
                    file,
                    evidence: [
                        createEvidence('file', {
                            path: file,
                            label: 'orphaned-file',
                            excerpt: `No import references found for this file`,
                        }),
                    ],
                    suggestedFix: `Review if this file is still needed. If not, remove it and its tests. Verify no dynamic imports before deletion.`,
                }));
            }
        }
        return { analyzerId: this.id, findings, durationMs: 0, errors };
    }
    getCandidateDirs(fp) {
        const dirs = ['src/components', 'components', 'lib', 'utils', 'helpers', 'hooks', 'composables'];
        if (fp.uiFramework === 'react' || fp.uiFramework === 'nextjs') {
            dirs.push('src/components', 'src/lib', 'src/utils', 'src/hooks');
        }
        return dirs;
    }
    async findCandidateFiles(projectRoot, candidateDirs) {
        const allFiles = [];
        const ignoredDirs = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage', '.turpan', '.vite', '__tests__', '__snapshots__']);
        for (const dir of candidateDirs) {
            const fullDir = join(projectRoot, dir);
            try {
                const files = walkFiles({
                    cwd: fullDir,
                    extensions: ['ts', 'tsx', 'js', 'jsx'],
                    ignoreDirs: ignoredDirs,
                });
                allFiles.push(...files);
            }
            catch {
                // Directory might not exist
            }
        }
        return allFiles;
    }
    shouldSkip(relPath) {
        for (const pattern of SKIP_PATTERNS) {
            if (pattern.test(basename(relPath)))
                return true;
        }
        // Skip route-like patterns
        if (/^\[.+\]\.[jt]sx?$/.test(basename(relPath)))
            return true;
        return false;
    }
    async buildImportGraph(projectRoot, files) {
        const imports = new Map();
        const importers = new Map();
        // Init maps
        for (const f of files) {
            imports.set(f, new Set());
            importers.set(f, new Set());
        }
        for (const file of files) {
            try {
                const content = await readFile(file, 'utf-8');
                const relFile = relative(projectRoot, file);
                const importedFiles = this.extractImports(content, projectRoot, relFile);
                for (const imported of importedFiles) {
                    imports.get(file).add(imported);
                    const absImported = join(projectRoot, imported);
                    if (importers.has(absImported)) {
                        importers.get(absImported).add(file);
                    }
                    // Also check without extension
                    for (const f of files) {
                        if (f.endsWith(imported) || f.endsWith(imported + '.ts') || f.endsWith(imported + '.tsx')) {
                            importers.get(f).add(file);
                        }
                    }
                }
            }
            catch {
                // Skip unreadable files
            }
        }
        return { imports, importers };
    }
    extractImports(content, projectRoot, currentFile) {
        const results = [];
        // Match: import X from '...'
        const importRe = /import\s+(?:(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g;
        // Match: require('...')
        const requireRe = /require\s*\(\s*['"]([^影子"']+)['"]\s*\)/g;
        // Match: dynamic import()
        const dynamicImportRe = /import\s*\(\s*['"]([^影子"']+)['"]\s*\)/g;
        let match;
        while ((match = importRe.exec(content)) !== null) {
            results.push(match[1]);
        }
        while ((match = requireRe.exec(content)) !== null) {
            results.push(match[1]);
        }
        while ((match = dynamicImportRe.exec(content)) !== null) {
            results.push(match[1]);
        }
        return results;
    }
}
//# sourceMappingURL=UnusedFileAnalyzer.js.map