/**
 * RouteDiscovery — detect which routes a Next.js / Vite app exposes,
 * without brute-force scanning.
 *
 * Strategy:
 * 1. Read known route files (Next.js app/pages dir, Vite router config)
 * 2. Crawl the homepage for links
 * 3. Combine into a deduplicated list, checking against a standard SaaS list
 */
import type { DiscoveredRoute, AppType } from './types.js';
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
export declare function discoverRoutes(options: RouteDiscoveryOptions): Promise<DiscoveredRoute[]>;
/**
 * Probe a list of routes by hitting them with a basic fetch,
 * returning which ones respond successfully.
 */
export declare function probeRoutes(baseUrl: string, routes: DiscoveredRoute[], timeoutMs?: number): Promise<DiscoveredRoute[]>;
//# sourceMappingURL=RouteDiscovery.d.ts.map