import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import type { ApiEndpoint, ApiReviewPlan } from './types.js';

export class ApiAgent {
  discover(projectRoot: string): ApiReviewPlan {
    const endpoints: ApiEndpoint[] = [];
    this.discoverNextHandlers(join(projectRoot, 'app'), endpoints);
    this.discoverExpressRoutes(projectRoot, endpoints);

    return {
      endpoints,
      boundaryTests: endpoints
        .filter((endpoint) => endpoint.safeToCall)
        .map((endpoint) => ({ endpoint, description: `safe local ${endpoint.method} request to ${endpoint.path}` })),
    };
  }

  private discoverNextHandlers(dir: string, endpoints: ApiEndpoint[]): void {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        this.discoverNextHandlers(full, endpoints);
        continue;
      }
      if (!/route\.(ts|js)$/.test(entry.name)) continue;
      const content = readFileSync(full, 'utf-8');
      for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const) {
        if (new RegExp(`export\\s+async\\s+function\\s+${method}\\b`).test(content)) {
          endpoints.push({
            method,
            path: this.routePathFromFile(full),
            source: full,
            safeToCall: method === 'GET',
          });
        }
      }
    }
  }

  private discoverExpressRoutes(projectRoot: string, endpoints: ApiEndpoint[]): void {
    const src = join(projectRoot, 'src');
    if (!existsSync(src)) return;
    const visit = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) visit(full);
        else if (/\.(ts|js)$/.test(entry.name)) {
          const content = readFileSync(full, 'utf-8');
          const routeRe = /app\.(get|post|put|patch|delete)\(['"`]([^'"`]+)['"`]/g;
          for (const match of content.matchAll(routeRe)) {
            const method = match[1].toUpperCase() as ApiEndpoint['method'];
            endpoints.push({ method, path: match[2], source: full, safeToCall: method === 'GET' });
          }
        }
      }
    };
    visit(src);
  }

  private routePathFromFile(path: string): string {
    const appIndex = path.indexOf('/app/');
    if (appIndex === -1) return '/';
    return '/' + path
      .slice(appIndex + '/app/'.length)
      .replace(/\/route\.(ts|js)$/, '')
      .replace(/\([^)]*\)\//g, '')
      .replace(/\[(.+?)\]/g, ':$1');
  }
}
