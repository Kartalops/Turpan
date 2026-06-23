/**
 * Detect Routes
 * Detects application routes based on framework conventions
 */
import { fileExists } from '@turpan/shared';
import { readdirSync } from 'fs';
export function detectRoutes(projectRoot) {
    const routeHints = [];
    const entrypoints = [];
    // Detect Next.js routes (App Router)
    if (fileExists(`${projectRoot}/app`)) {
        const appRoutes = detectNextJsRoutes(`${projectRoot}/app`);
        if (appRoutes.length > 0) {
            routeHints.push({
                type: 'app',
                count: appRoutes.length,
                sampleRoutes: appRoutes.slice(0, 5),
            });
        }
    }
    // Detect Next.js/React Pages router
    if (fileExists(`${projectRoot}/pages`) || fileExists(`${projectRoot}/src/pages`)) {
        const pagesDir = fileExists(`${projectRoot}/pages`) ? `${projectRoot}/pages` : `${projectRoot}/src/pages`;
        const pageRoutes = detectPageRoutes(pagesDir);
        routeHints.push({
            type: 'pages',
            count: pageRoutes.length,
            sampleRoutes: pageRoutes.slice(0, 5),
        });
    }
    // Detect Vite React routes (typically manual, check for common patterns)
    if (fileExists(`${projectRoot}/src/routes`) || fileExists(`${projectRoot}/routes`)) {
        const routesDir = fileExists(`${projectRoot}/src/routes`) ? `${projectRoot}/src/routes` : `${projectRoot}/routes`;
        const viteRoutes = detectFileRoutes(routesDir);
        routeHints.push({
            type: 'pages', // Vite apps typically use pages-style routing
            count: viteRoutes.length,
            sampleRoutes: viteRoutes.slice(0, 5),
        });
    }
    // Detect entrypoints
    detectEntrypoints(projectRoot, entrypoints);
    return { routeHints, entrypoints };
}
function detectNextJsRoutes(appDir) {
    const routes = [];
    try {
        const walkDir = (dir, prefix = '') => {
            const items = readdirSync(dir, { withFileTypes: true });
            for (const item of items) {
                if (item.name === 'layout.tsx' || item.name === 'layout.ts' ||
                    item.name === 'template.tsx' || item.name === 'template.ts' ||
                    item.name === 'loading.tsx' || item.name === 'loading.ts' ||
                    item.name === 'error.tsx' || item.name === 'error.ts' ||
                    item.name === 'page.tsx' || item.name === 'page.ts') {
                    // This is a route segment
                    const routePath = prefix === '' ? '/' : prefix;
                    if (!routes.includes(routePath)) {
                        routes.push(routePath);
                    }
                }
                else if (item.isDirectory()) {
                    let routePath = prefix === '' ? `/${item.name}` : `${prefix}/${item.name}`;
                    // Handle dynamic routes
                    if (item.name.startsWith('[') || item.name.startsWith('(')) {
                        routePath = prefix; // Group routes don't add to path
                    }
                    // Handle catch-all routes
                    if (item.name.startsWith('...')) {
                        routePath = `${prefix}/${item.name.slice(3)}[...rest]`;
                    }
                    walkDir(`${dir}/${item.name}`, routePath);
                }
            }
        };
        walkDir(appDir);
    }
    catch {
        // Ignore errors
    }
    return routes;
}
function detectPageRoutes(pagesDir) {
    const routes = [];
    try {
        const walkDir = (dir, prefix = '') => {
            const items = readdirSync(dir, { withFileTypes: true });
            for (const item of items) {
                if (item.name === '_app.tsx' || item.name === '_app.ts' ||
                    item.name === '_document.tsx' || item.name === '_document.ts' ||
                    item.name === '_error.tsx' || item.name === '_error.ts') {
                    // These are Next.js special files, skip
                    continue;
                }
                if (item.isFile() && (item.name.endsWith('.tsx') || item.name.endsWith('.ts'))) {
                    let routePath;
                    if (item.name === 'index.tsx' || item.name === 'index.ts') {
                        routePath = prefix === '' ? '/' : prefix;
                    }
                    else {
                        const nameWithoutExt = item.name.replace(/\.(tsx|ts)$/, '');
                        routePath = prefix === '' ? `/${nameWithoutExt}` : `${prefix}/${nameWithoutExt}`;
                    }
                    routes.push(routePath);
                }
                else if (item.isDirectory()) {
                    const newPrefix = prefix === '' ? `/${item.name}` : `${prefix}/${item.name}`;
                    walkDir(`${dir}/${item.name}`, newPrefix);
                }
            }
        };
        walkDir(pagesDir);
    }
    catch {
        // Ignore errors
    }
    return routes;
}
function detectFileRoutes(routesDir) {
    const routes = [];
    try {
        const items = readdirSync(routesDir, { withFileTypes: true });
        for (const item of items) {
            if (item.isFile() && (item.name.endsWith('.tsx') || item.name.endsWith('.ts'))) {
                const nameWithoutExt = item.name.replace(/\.(tsx|ts)$/, '');
                routes.push(nameWithoutExt === 'index' ? '/' : `/${nameWithoutExt}`);
            }
        }
    }
    catch {
        // Ignore errors
    }
    return routes;
}
function detectEntrypoints(projectRoot, entrypoints) {
    // Common Node.js entrypoints
    const commonEntryPoints = [
        { name: 'index', path: 'index.js', type: 'cli' },
        { name: 'main', path: 'main.js', type: 'cli' },
        { name: 'server', path: 'server.js', type: 'server' },
        { name: 'bot', path: 'bot.js', type: 'cli' },
        { name: 'cli', path: 'cli.js', type: 'cli' },
        { name: 'app', path: 'app.js', type: 'server' },
        { name: 'worker', path: 'worker.js', type: 'worker' },
    ];
    // Check src/ directory too
    const srcEntryPoints = [
        { name: 'index', path: 'src/index.js', type: 'cli' },
        { name: 'main', path: 'src/main.js', type: 'cli' },
        { name: 'server', path: 'src/server.js', type: 'server' },
        { name: 'bot', path: 'src/bot.js', type: 'cli' },
    ];
    const allEntries = [...commonEntryPoints, ...srcEntryPoints];
    for (const entry of allEntries) {
        if (fileExists(`${projectRoot}/${entry.path}`)) {
            // Avoid duplicates
            if (!entrypoints.some(e => e.path === entry.path)) {
                entrypoints.push({
                    name: entry.name,
                    path: entry.path,
                    type: entry.type,
                });
            }
        }
    }
    // Python entrypoints
    const pythonEntries = [
        { name: 'main', path: 'main.py', type: 'cli' },
        { name: 'bot', path: 'bot.py', type: 'cli' },
        { name: 'app', path: 'app.py', type: 'server' },
        { name: 'server', path: 'server.py', type: 'server' },
    ];
    for (const entry of pythonEntries) {
        if (fileExists(`${projectRoot}/${entry.path}`)) {
            if (!entrypoints.some(e => e.path === entry.path)) {
                entrypoints.push({
                    name: entry.name,
                    path: entry.path,
                    type: entry.type,
                });
            }
        }
    }
    // Check for plugin/extension entrypoints
    if (fileExists(`${projectRoot}/src/plugin.ts`) || fileExists(`${projectRoot}/src/plugin.js`)) {
        entrypoints.push({
            name: 'plugin',
            path: fileExists(`${projectRoot}/src/plugin.ts`) ? 'src/plugin.ts' : 'src/plugin.js',
            type: 'plugin',
        });
    }
}
//# sourceMappingURL=detectRoutes.js.map