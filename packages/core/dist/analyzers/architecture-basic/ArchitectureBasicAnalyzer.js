/**
 * Architecture Basic Analyzer
 * Detects fundamental architectural issues:
 * - Circular imports
 * - API/client duplication
 * - Scattered process.env usage
 * - Business logic inside UI components
 */
import { createFinding, confidence } from '../../findings/Finding.js';
import { createEvidence } from '../../findings/Evidence.js';
import { readFile } from 'fs/promises';
import { relative } from 'path';
import { walkFiles } from '../../shared/index.js';
export class ArchitectureBasicAnalyzer {
    id = 'architecture-basic';
    name = 'Architecture Basic Analyzer';
    categories = ['architecture'];
    supports(fp) {
        return fp.languages.some(language => ['typescript', 'javascript'].includes(language.toLowerCase()));
    }
    async run(ctx) {
        const errors = [];
        const findings = [];
        const files = await this.findSourceFiles(ctx.projectRoot);
        if (files.length === 0) {
            return { analyzerId: this.id, findings: [], durationMs: 0, errors: [] };
        }
        // --- Circular import detection ---
        const circularFindings = await this.detectCircularImports(ctx.projectRoot, files);
        findings.push(...circularFindings);
        // --- API/client duplication ---
        const apiFindings = await this.detectApiDuplication(ctx.projectRoot, files);
        findings.push(...apiFindings);
        // --- Scattered process.env ---
        const envFindings = await this.detectScatteredEnvUsage(ctx.projectRoot, files);
        findings.push(...envFindings);
        // --- Business logic in UI components ---
        const bizFindings = await this.detectBusinessLogicInUI(ctx.projectRoot, files);
        findings.push(...bizFindings);
        return { analyzerId: this.id, findings, durationMs: 0, errors };
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Circular Import Detection
    // ─────────────────────────────────────────────────────────────────────────
    async detectCircularImports(projectRoot, files) {
        const findings = [];
        const graph = new Map();
        for (const file of files) {
            const relPath = relative(projectRoot, file).replace(/\\/g, '/').replace(/\.(ts|tsx|js|jsx|mts|cts)$/, '');
            graph.set(relPath, new Set());
            try {
                const content = await readFile(file, 'utf-8');
                const imports = this.extractRelativeImports(content);
                for (const rawImp of imports) {
                    // Resolve relative import to an actual file path
                    const dir = relPath.includes('/') ? relPath.slice(0, relPath.lastIndexOf('/')) : '';
                    const resolved = dir ? `${dir}/${rawImp}` : rawImp;
                    // Normalize: resolve ./ and ../ and strip .js/.ts extensions
                    const normalized = this.normalizeImportPath(resolved);
                    graph.get(relPath).add(normalized);
                }
            }
            catch {
                // skip
            }
        }
        // Detect cycles using DFS over resolved paths
        const visited = new Set();
        const recursionStack = new Set();
        const cyclePaths = [];
        const dfs = (node, path) => {
            visited.add(node);
            recursionStack.add(node);
            for (const neighbor of graph.get(node) ?? []) {
                // Only follow neighbors that exist as graph nodes (actual source files)
                if (!graph.has(neighbor))
                    continue;
                if (!visited.has(neighbor)) {
                    dfs(neighbor, [...path, neighbor]);
                }
                else if (recursionStack.has(neighbor)) {
                    // Found a cycle
                    const cycleStart = path.indexOf(neighbor);
                    if (cycleStart !== -1) {
                        cyclePaths.push([...path.slice(cycleStart), neighbor]);
                    }
                    else {
                        cyclePaths.push([...path, neighbor]);
                    }
                }
            }
            recursionStack.delete(node);
        };
        for (const node of graph.keys()) {
            if (!visited.has(node)) {
                dfs(node, [node]);
            }
        }
        // Report cycles (deduplicated)
        const reportedCycles = new Set();
        for (const cycle of cyclePaths) {
            const cycleKey = cycle.join(' → ');
            if (reportedCycles.has(cycleKey))
                continue;
            reportedCycles.add(cycleKey);
            findings.push(createFinding({
                id: `circular-import-${cycle[0].replace(/[^a-z0-9]/gi, '-')}`,
                title: `Circular import detected: ${cycle.slice(0, 3).join(' → ')}${cycle.length > 3 ? ' → …' : ''}`,
                explanation: `Module dependency cycle: ${cycle.join(' → ')}. Circular imports can cause runtime errors, make testing difficult, and indicate poor architectural boundaries.`,
                severity: 'medium',
                category: 'architecture',
                fixable: 'manual',
                confidence: confidence(80),
                tags: ['architecture', 'circular-dependency', 'import'],
                evidence: [
                    createEvidence('file', { label: 'cycle', excerpt: cycle.join(' → ') }),
                ],
                suggestedFix: `Refactor to break the cycle. Move shared code to a third module that neither of the cyclically-dependent modules imports. Use dependency inversion.`,
            }));
        }
        return findings;
    }
    /** Normalize a relative import path: resolve ../, strip ./, strip .js/.ts/.tsx */
    normalizeImportPath(imp) {
        // Remove ./ prefix
        let normalized = imp.replace(/^\.\//, '');
        // Resolve ../ — split and collapse
        const parts = normalized.split('/');
        const resolved = [];
        for (const part of parts) {
            if (part === '..') {
                resolved.pop();
            }
            else if (part !== '.') {
                resolved.push(part);
            }
        }
        // Strip file extension
        return resolved.join('/').replace(/\.(ts|tsx|js|jsx|mts|cts)$/, '');
    }
    extractRelativeImports(content) {
        const results = [];
        const importRe = /import\s+(?:(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g;
        let match;
        while ((match = importRe.exec(content)) !== null) {
            const imp = match[1];
            // Only relative imports
            if (imp.startsWith('.')) {
                results.push(imp);
            }
        }
        return results;
    }
    // ─────────────────────────────────────────────────────────────────────────
    // API / Client Duplication
    // ─────────────────────────────────────────────────────────────────────────
    async detectApiDuplication(projectRoot, files) {
        const findings = [];
        // Find all api/client/axios/fetch usages and their base URLs/paths
        const apiUsages = new Map();
        for (const file of files) {
            try {
                const content = await readFile(file, 'utf-8');
                const lines = content.split('\n');
                const relPath = relative(projectRoot, file);
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    // axios.get/post/put/delete, fetch(, api.post(, etc.
                    const match = line.match(/(\.get|\.post|\.put|\.patch|\.delete|fetch\s*\()\s*['"]([^'"]+)['"]/);
                    if (match) {
                        const usages = apiUsages.get(match[2]) ?? [];
                        usages.push({ file: relPath, line: i + 1, pattern: match[1] });
                        apiUsages.set(match[2], usages);
                    }
                }
            }
            catch {
                // skip
            }
        }
        // Report URL paths that are hardcoded in multiple files
        for (const [url, usages] of apiUsages) {
            if (usages.length >= 3 && !url.includes('${') && !url.includes('localhost')) {
                const uniqueFiles = [...new Set(usages.map(u => u.file))];
                findings.push(createFinding({
                    id: `api-duplication-${url.replace(/[^a-z0-9]/gi, '-')}`.substring(0, 60),
                    title: `Hardcoded API URL in ${uniqueFiles.length} files: ${url}`,
                    explanation: `API URL "${url}" appears ${usages.length} times across ${uniqueFiles.length} files (${uniqueFiles.join(', ')}). This indicates duplicated API endpoint references that should be centralized.`,
                    severity: 'low',
                    category: 'architecture',
                    fixable: 'manual',
                    confidence: confidence(75),
                    tags: ['architecture', 'api-duplication', 'hardcoded-url'],
                    evidence: [
                        createEvidence('metric', { value: uniqueFiles.length, unit: 'files', label: 'file-count' }),
                        createEvidence('metric', { value: usages.length, unit: 'references', label: 'url-references' }),
                    ],
                    suggestedFix: `Centralize API endpoints in a config/const file (e.g., src/config/api.ts) and import from there. This makes endpoint changes easier and prevents inconsistencies.`,
                }));
            }
        }
        return findings;
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Scattered process.env usage
    // ─────────────────────────────────────────────────────────────────────────
    async detectScatteredEnvUsage(projectRoot, files) {
        const findings = [];
        // Count process.env / import.meta.env references per file
        const envUsagePerFile = new Map();
        for (const file of files) {
            try {
                const content = await readFile(file, 'utf-8');
                const matches = content.match(/process\.env\.\w+|import\.meta\.env\.\w+/g);
                if (matches) {
                    const count = (envUsagePerFile.get(file) ?? 0) + matches.length;
                    envUsagePerFile.set(file, count);
                }
            }
            catch {
                // skip
            }
        }
        const filesWithEnv = [...envUsagePerFile.entries()]
            .filter(([, count]) => count >= 3)
            .sort((a, b) => b[1] - a[1]);
        if (filesWithEnv.length >= 3) {
            // Check if there's a central env file
            const hasCentralEnv = files.some(f => /env\.(ts|js)$/i.test(f) || /\/config\/.*env/i.test(f));
            if (!hasCentralEnv) {
                const totalRefs = filesWithEnv.reduce((s, [, c]) => s + c, 0);
                findings.push(createFinding({
                    id: 'scattered-env-usage',
                    title: `Scattered environment variable usage: ${totalRefs} references across ${filesWithEnv.length} files`,
                    explanation: `Environment variables are accessed directly in ${filesWithEnv.length} files without a centralized configuration layer. This makes it hard to track which env vars are used and validate them at startup.`,
                    severity: 'low',
                    category: 'architecture',
                    fixable: 'manual',
                    confidence: confidence(70),
                    tags: ['architecture', 'environment-variables', 'scattered'],
                    evidence: [
                        createEvidence('metric', { value: filesWithEnv.length, unit: 'files', label: 'file-count' }),
                        createEvidence('metric', { value: totalRefs, unit: 'references', label: 'total-refs' }),
                    ],
                    suggestedFix: `Create a centralized env config module (e.g., src/config/env.ts) that reads and validates all env vars at startup. Components import from this config instead of accessing process.env directly.`,
                }));
            }
        }
        return findings;
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Business logic in UI components
    // ─────────────────────────────────────────────────────────────────────────
    async detectBusinessLogicInUI(projectRoot, files) {
        const findings = [];
        // Look for React/Vue component files with business logic patterns
        const componentExtensions = ['.tsx', '.jsx', '.vue'];
        const logicPatterns = [
            /\bfetch\s*\(|\baxios\.|\bapi\.|\bdatabase\.|\bdb\.|await\s+.*\.(find|create|update|delete)/i,
            /\bawait\s+.*\.send\(|\bawait\s+.*\.post\(|\bawait\s+.*\.get\(/,
        ];
        for (const file of files) {
            if (!componentExtensions.some(ext => file.endsWith(ext)))
                continue;
            try {
                const content = await readFile(file, 'utf-8');
                const relPath = relative(projectRoot, file);
                let matchCount = 0;
                for (const pattern of logicPatterns) {
                    const matches = content.match(pattern);
                    if (matches)
                        matchCount += matches.length;
                }
                // If a component file has significant business logic patterns, flag it
                if (matchCount >= 2) {
                    findings.push(createFinding({
                        id: `biz-in-ui-${relPath.replace(/[^a-z0-9]/gi, '-')}`,
                        title: `Business logic in UI component: ${relPath}`,
                        explanation: `Component file "${relPath}" appears to contain direct business logic (${matchCount} API/database calls). Mixing business logic with UI makes components harder to test and reuse.`,
                        severity: 'low',
                        category: 'architecture',
                        fixable: 'manual',
                        confidence: confidence(65),
                        tags: ['architecture', 'business-logic', 'ui-component', 'separation-of-concerns'],
                        file,
                        evidence: [
                            createEvidence('metric', { value: matchCount, unit: 'patterns', label: 'business-logic-patterns' }),
                        ],
                        suggestedFix: `Extract business logic into custom hooks (use*), services, or store modules. Components should only handle rendering and user interaction.`,
                    }));
                }
            }
            catch {
                // skip
            }
        }
        return findings;
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────
    async findSourceFiles(projectRoot) {
        const ignoredDirs = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage', '.turpan']);
        return walkFiles({
            cwd: projectRoot,
            extensions: ['ts', 'tsx', 'js', 'jsx'],
            ignoreDirs: ignoredDirs,
        });
    }
}
//# sourceMappingURL=ArchitectureBasicAnalyzer.js.map