import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
export class ApiAgent {
    discover(projectRoot) {
        const endpoints = [];
        this.discoverNextHandlers(join(projectRoot, 'app'), endpoints);
        this.discoverExpressRoutes(projectRoot, endpoints);
        return {
            endpoints,
            boundaryTests: endpoints
                .filter((endpoint) => endpoint.safeToCall)
                .map((endpoint) => ({ endpoint, description: `safe local ${endpoint.method} request to ${endpoint.path}` })),
        };
    }
    discoverNextHandlers(dir, endpoints) {
        if (!existsSync(dir))
            return;
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) {
                this.discoverNextHandlers(full, endpoints);
                continue;
            }
            if (!/route\.(ts|js)$/.test(entry.name))
                continue;
            const content = readFileSync(full, 'utf-8');
            for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
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
    discoverExpressRoutes(projectRoot, endpoints) {
        const src = join(projectRoot, 'src');
        if (!existsSync(src))
            return;
        const visit = (dir) => {
            for (const entry of readdirSync(dir, { withFileTypes: true })) {
                const full = join(dir, entry.name);
                if (entry.isDirectory())
                    visit(full);
                else if (/\.(ts|js)$/.test(entry.name)) {
                    const content = readFileSync(full, 'utf-8');
                    const routeRe = /app\.(get|post|put|patch|delete)\(['"`]([^'"`]+)['"`]/g;
                    for (const match of content.matchAll(routeRe)) {
                        const method = match[1].toUpperCase();
                        endpoints.push({ method, path: match[2], source: full, safeToCall: method === 'GET' });
                    }
                }
            }
        };
        visit(src);
    }
    routePathFromFile(path) {
        const appIndex = path.indexOf('/app/');
        if (appIndex === -1)
            return '/';
        return '/' + path
            .slice(appIndex + '/app/'.length)
            .replace(/\/route\.(ts|js)$/, '')
            .replace(/\([^)]*\)\//g, '')
            .replace(/\[(.+?)\]/g, ':$1');
    }
}
//# sourceMappingURL=ApiAgent.js.map