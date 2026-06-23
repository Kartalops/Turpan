/**
 * RouteDiscovery — detect which routes a Next.js / Vite app exposes,
 * without brute-force scanning.
 *
 * Strategy:
 * 1. Read known route files (Next.js app/pages dir, Vite router config)
 * 2. Crawl the homepage for links
 * 3. Combine into a deduplicated list, checking against a standard SaaS list
 */

import { readdir, readFile } from 'fs/promises';
import { join, extname, basename } from 'path';
import type { DiscoveredRoute, AppType } from './types.js';

const SAAS_ROUTES = ['/', '/login', '/register', '/dashboard', '/pricing', '/settings', '/account', '/admin', '/about', '/contact', '/blog', '/docs', '/faq', '/pricing', '/features'];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RouteDiscoveryOptions {
  projectRoot: string;
  appType: AppType;
  baseUrl: string;
  /** Additional routes found from route-file analysis */
  knownRoutes?: string[];
  /** Routes found from link crawling */
  linkedRoutes?: string[];
}

/**
 * Discover all routes by combining file-based and link-based discovery.
 */
export async function discoverRoutes(options: RouteDiscoveryOptions): Promise<DiscoveredRoute[]> {
  const { projectRoot, appType, baseUrl, knownRoutes = [], linkedRoutes = [] } = options;

  // 1. File-based route discovery
  const fileRoutes = await discoverFromFiles(projectRoot, appType);

  // 2. Merge with explicitly passed known routes (from fingerprint)
  const allFileRoutes = [...new Set([...fileRoutes, ...knownRoutes])];

  // 3. Filter SaaS routes only if they exist in file routes or linked routes
  const candidateRoutes = new Set<string>();
  for (const route of allFileRoutes) candidateRoutes.add(route);
  for (const route of linkedRoutes) candidateRoutes.add(route);
  for (const route of SAAS_ROUTES) candidateRoutes.add(route);

  const routes: DiscoveredRoute[] = [];
  const seen = new Set<string>();

  for (const path of candidateRoutes) {
    if (seen.has(path)) continue;
    seen.add(path);

    const source = allFileRoutes.includes(path) ? 'known'
                 : linkedRoutes.includes(path) ? 'link'
                 : 'known'; // SaaS default list

    routes.push({ path, source, loaded: false });
  }

  // Sort: homepage first, then alpha
  routes.sort((a, b) => {
    if (a.path === '/') return -1;
    if (b.path === '/') return 1;
    return a.path.localeCompare(b.path);
  });

  return routes;
}

/**
 * Probe a list of routes by hitting them with a basic fetch,
 * returning which ones respond successfully.
 */
export async function probeRoutes(
  baseUrl: string,
  routes: DiscoveredRoute[],
  timeoutMs: number = 5000
): Promise<DiscoveredRoute[]> {
  const results = await Promise.allSettled(
    routes.map(async (route) => {
      const url = `${baseUrl}${route.path === '/' ? '' : route.path}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(url, {
          signal: controller.signal,
          redirect: 'follow',
        });
        clearTimeout(timer);
        return {
          ...route,
          statusCode: res.status,
          loaded: res.status < 400,
          error: res.status >= 400 ? `HTTP ${res.status}` : undefined,
        };
      } catch (err) {
        clearTimeout(timer);
        return { ...route, loaded: false, error: String(err) };
      }
    })
  );

  return results.map((r) => (r.status === 'fulfilled' ? r.value : r.reason ?? { ...routes[0], loaded: false }));
}

// ---------------------------------------------------------------------------
// File-based discovery
// ---------------------------------------------------------------------------

async function discoverFromFiles(projectRoot: string, appType: AppType): Promise<string[]> {
  if (appType === 'nextjs') return discoverNextRoutes(projectRoot);
  if (appType === 'vite-react') return discoverViteRoutes(projectRoot);
  return [];
}

async function discoverNextRoutes(projectRoot: string): Promise<string[]> {
  const routes = new Set<string>();

  // Next.js App Router
  const appDir = join(projectRoot, 'app');
  if (existsSync(appDir)) {
    await walkDir(appDir, '', routes);
  }

  // Next.js Pages Router
  const pagesDir = join(projectRoot, 'pages');
  if (existsSync(pagesDir)) {
    await walkDir(pagesDir, '', routes, { skipAppRouter: true });
  }

  return [...routes];
}

async function walkDir(
  dir: string,
  prefix: string,
  routes: Set<string>,
  opts: { skipAppRouter?: boolean } = {}
): Promise<void> {
  let entries: import('fs').Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const name = entry.name;

    if (entry.isDirectory()) {
      if (name === 'api' || name === '_next' || name.startsWith('.')) continue;
      if (name === 'layout' || name === 'template' || name === 'loading' || name === 'error' || name === 'not-found') continue;

      // Dynamic route segment
      if (name.startsWith('[') || name.startsWith('(') || name.startsWith('[')) {
        await walkDir(join(dir, name), `${prefix}/${name}`, routes, opts);
        continue;
      }

      await walkDir(join(dir, name), `${prefix}/${name}`, routes, opts);
    } else if (entry.isFile()) {
      const ext = extname(name);
      if (!['.ts', '.tsx', '.js', '.jsx'].includes(ext)) continue;

      const base = basename(name, ext);
      if (base === 'index') {
        routes.add(`${prefix}/` === '//' ? '/' : `${prefix}/` || '/');
      } else if (base !== '_app' && base !== '_document' && base !== '_error') {
        routes.add(`${prefix}/${base}`.replace(/\/+/g, '/'));
      }
    }
  }
}

async function discoverViteRoutes(projectRoot: string): Promise<string[]> {
  const routes = new Set<string>();

  // Vite + React Router: look for common router file patterns
  const routerCandidates = [
    join(projectRoot, 'src/router.ts'),
    join(projectRoot, 'src/router.tsx'),
    join(projectRoot, 'src/App.tsx'),
    join(projectRoot, 'src/App.jsx'),
    join(projectRoot, 'src/routes.ts'),
    join(projectRoot, 'src/routes.tsx'),
  ];

  for (const candidate of routerCandidates) {
    if (existsSync(candidate)) {
      try {
        const content = await readFile(candidate, 'utf-8');
        const found = extractRoutesFromContent(content);
        found.forEach(r => routes.add(r));
      } catch { /* ignore */ }
    }
  }

  // Also scan pages/ directory if it exists (react-router-pages pattern)
  const pagesDir = join(projectRoot, 'src/pages');
  if (existsSync(pagesDir)) {
    await walkDir(pagesDir, '', routes);
  }

  return [...routes];
}

function extractRoutesFromContent(content: string): string[] {
  const routes: string[] = [];

  // Match route() or <Route> patterns from react-router / wouter / tanstack-router
  const patterns = [
    /route\s*\(\s*['"`]([^'"`]+)['"`]/g,
    /path\s*[=:]\s*['"`]([^'"`]+)['"`]/g,
    /<Route\s+path\s*=\s*['"`]([^'"`]+)['"`]/g,
    /['"`](?:\/[\w\-\{\}:]+)+['"`]/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const path = match[1];
      if (isValidRoute(path)) {
        routes.push(normalizeRoute(path));
      }
    }
  }

  return routes;
}

function isValidRoute(path: string): boolean {
  return path.startsWith('/') && path.length > 1 && !path.includes('*');
}

function normalizeRoute(path: string): string {
  return path.replace(/\/$/, '') || '/';
}

// Polyfill for Node fs existsSync
function existsSync(p: string): boolean {
  try { require('fs').accessSync(p); return true; } catch { return false; }
}