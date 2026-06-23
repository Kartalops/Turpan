/**
 * UnwiredFeatureAnalyzer — detects features that exist but are not connected
 *
 * Detects:
 * - Component exists but no route imports it
 * - API route exists but UI never calls it
 * - Button exists but no handler
 * - Function defined but never called
 */
import { readFileSync, readdirSync } from 'fs';
import { join, extname, basename } from 'path';
/**
 * Analyze the project for unwired features
 */
export function analyzeUnwiredFeatures(opts) {
    const { projectRoot } = opts;
    const issues = [];
    // Scan all source files
    const sourceFiles = gatherSourceFiles(projectRoot);
    // Find all imports/references
    const importGraph = buildImportGraph(sourceFiles);
    // For each capability, check if the implementation is wired
    for (const file of sourceFiles) {
        const relPath = file.replace(projectRoot + '/', '');
        const content = readFileSync(file, 'utf-8');
        // Check for unwired API routes (defined but no references)
        if (isApiRoute(file, relPath)) {
            const routeKey = normalizeRoute(relPath);
            const refs = getReferences(routeKey, importGraph, sourceFiles, projectRoot);
            if (refs.length === 0) {
                issues.push({
                    kind: 'unwired-feature',
                    severity: 'medium',
                    title: `API route defined but appears unused: ${routeKey}`,
                    explanation: `The file ${relPath} defines an API route but no other file imports or calls it. Either the route is dead code or the UI is not wired to call it.`,
                    file: relPath,
                    suggestedFix: 'Verify the UI calls this endpoint, or remove the unused route. If it is intentionally for future use, add a comment noting this.',
                    confidence: 70,
                    evidence: [
                        {
                            type: 'route',
                            path: relPath,
                            excerpt: content.slice(0, 300).replace(/\s+/g, ' ').trim(),
                        },
                    ],
                });
            }
        }
        // Check for component defined but never imported
        if (isComponent(file, relPath)) {
            const componentName = extractComponentName(file, relPath);
            const refs = findImportOfComponent(componentName, sourceFiles, projectRoot);
            if (refs.length === 0) {
                issues.push({
                    kind: 'unwired-feature',
                    severity: 'medium',
                    title: `Component defined but never imported: ${componentName}`,
                    explanation: `The component ${componentName} in ${relPath} is defined but no other file imports it. This typically means the component was created but not wired into any page or layout.`,
                    file: relPath,
                    suggestedFix: 'Import and use this component in a relevant page, or remove it if it is not needed.',
                    confidence: 80,
                    evidence: [
                        {
                            type: 'component',
                            path: relPath,
                            excerpt: content.slice(0, 300).replace(/\s+/g, ' ').trim(),
                        },
                    ],
                });
            }
        }
        // Check for button/handler pairs
        if (isHandler(file, relPath)) {
            const handlerName = extractHandlerName(relPath);
            // Look for onClick or event handlers referencing this
            const hasHandlerUsage = sourceFiles.some(other => {
                if (other === file)
                    return false;
                const otherContent = readFileSync(other, 'utf-8');
                return new RegExp(`onClick.*${handlerName}|handleClick.*${handlerName}|${handlerName}\\s*\\(`, 'i').test(otherContent);
            });
            if (!hasHandlerUsage) {
                issues.push({
                    kind: 'unwired-feature',
                    severity: 'low',
                    title: `Handler function defined but not referenced: ${handlerName}`,
                    explanation: `Handler ${handlerName} in ${relPath} is defined but not called from any onClick or event handler.`,
                    file: relPath,
                    suggestedFix: 'Wire this handler to a UI element or remove it if unused.',
                    confidence: 60,
                    evidence: [
                        {
                            type: 'code',
                            path: relPath,
                            excerpt: content.slice(0, 300).replace(/\s+/g, ' ').trim(),
                        },
                    ],
                });
            }
        }
    }
    // Check for Next.js pages/components that exist but are not in the layout
    const nextJsIssues = checkNextJsUnwired(projectRoot);
    issues.push(...nextJsIssues);
    return issues;
}
function gatherSourceFiles(projectRoot) {
    const files = [];
    const textExts = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs']);
    function walk(dir, depth = 0) {
        if (depth > 5)
            return;
        try {
            const entries = readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'build' || entry.name === '.next' || entry.name === 'coverage' || entry.name === '.turpan')
                    continue;
                const fullPath = join(dir, entry.name);
                if (entry.isDirectory()) {
                    walk(fullPath, depth + 1);
                }
                else if (entry.isFile() && textExts.has(entry.name.split('.').pop() ?? '')) {
                    files.push(fullPath);
                }
            }
        }
        catch {
            // skip
        }
    }
    walk(projectRoot);
    return files;
}
function buildImportGraph(files) {
    // file -> set of files it imports
    const graph = new Map();
    for (const file of files) {
        try {
            const content = readFileSync(file, 'utf-8');
            const imports = new Set();
            // ESM: import x from './foo'
            const esmMatches = content.matchAll(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/g);
            for (const m of esmMatches) {
                imports.add(m[1]);
            }
            // CommonJS: require('./foo')
            const cjsMatches = content.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\)/g);
            for (const m of cjsMatches) {
                imports.add(m[1]);
            }
            graph.set(file, imports);
        }
        catch {
            graph.set(file, new Set());
        }
    }
    return graph;
}
function isApiRoute(file, relPath) {
    return /\/(api|routes)\//.test(relPath) || /\.route\.(ts|js)$/.test(file) || /\/route\.(ts|js)$/.test(relPath);
}
function isComponent(file, relPath) {
    return /\/components?\//.test(relPath) || /\/ui\//.test(relPath) || /\/widgets?\//.test(relPath);
}
function isHandler(file, relPath) {
    const name = basename(file);
    return /handler|onClick|useCallback|useMemo/.test(name) || /handler/i.test(relPath);
}
function normalizeRoute(relPath) {
    // app/api/users/route.ts -> /api/users
    const match = relPath.match(/(?:app|api|routes)\/(.+?)(?:\/route)?\.[jt]s$/);
    if (match) {
        return '/' + match[1].replace(/\/route$/, '');
    }
    return relPath;
}
function extractComponentName(file, _relPath) {
    const name = basename(file, extname(file));
    return name.replace(/^[A-Z]/, (c) => c.toLowerCase()); // PascalCase to camelCase
}
function extractHandlerName(relPath) {
    const name = basename(relPath);
    return name.replace(/\.(ts|tsx|js|jsx)$/, '').replace(/^[A-Z]/, (c) => c.toLowerCase());
}
function getReferences(routeKey, _importGraph, _files, projectRoot) {
    // Look for any file that imports from or references this route
    const refs = [];
    const normalizedKey = routeKey.replace(/^\//, '').replace(/\//g, '\\/');
    for (const file of _files) {
        if (file === projectRoot)
            continue;
        try {
            const content = readFileSync(file, 'utf-8');
            if (content.includes(routeKey) || content.includes(normalizedKey)) {
                refs.push(file.replace(projectRoot + '/', ''));
            }
        }
        catch {
            // skip
        }
    }
    return refs;
}
function findImportOfComponent(componentName, files, projectRoot) {
    const refs = [];
    for (const file of files) {
        if (file === projectRoot)
            continue;
        try {
            const content = readFileSync(file, 'utf-8');
            if (content.includes(`import`) &&
                (content.includes(`"${componentName}"`) || content.includes(`'${componentName}'`))) {
                refs.push(file.replace(projectRoot + '/', ''));
            }
        }
        catch {
            // skip
        }
    }
    return refs;
}
function checkNextJsUnwired(projectRoot) {
    const issues = [];
    const appDir = join(projectRoot, 'app');
    try {
        const entries = readdirSync(appDir, { withFileTypes: true });
        const pageFiles = [];
        for (const entry of entries) {
            if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && entry.name !== 'layout.tsx' && entry.name !== 'layout.ts') {
                pageFiles.push(join(appDir, entry.name));
            }
        }
        // Check layout.tsx for imports
        const layoutPath = join(appDir, 'layout.tsx');
        let layoutContent = '';
        try {
            layoutContent = readFileSync(layoutPath, 'utf-8');
        }
        catch {
            return issues;
        }
        for (const pageFile of pageFiles) {
            const relPath = pageFile.replace(projectRoot + '/', '');
            const pageName = basename(pageFile, extname(pageFile));
            const camelName = pageName.replace(/^[A-Z]/, (c) => c.toLowerCase());
            const hasImport = layoutContent.includes(`"${pageName}"`) || layoutContent.includes(`'${pageName}'`) ||
                layoutContent.includes(`"${camelName}"`) || layoutContent.includes(`'${camelName}'`);
            if (!hasImport) {
                issues.push({
                    kind: 'unwired-feature',
                    severity: 'low',
                    title: `Next.js page file exists but may not be wired: /${pageName}`,
                    explanation: `The file ${relPath} is a page file but may not be imported or used in the app layout. Next.js App Router auto-routes files in /app, so this is informational if the file is intended as a standalone route.`,
                    file: relPath,
                    suggestedFix: 'If this page should be accessible at a URL, verify it is linked from navigation. If it is unused, remove it.',
                    confidence: 50,
                    evidence: [
                        {
                            type: 'file',
                            path: relPath,
                            excerpt: '',
                        },
                    ],
                });
            }
        }
    }
    catch {
        // app directory doesn't exist
    }
    return issues;
}
//# sourceMappingURL=UnwiredFeatureAnalyzer.js.map