/**
 * Detect Routes
 * Detects application routes based on framework conventions
 */
import type { RouteHint, Entrypoint } from './ProjectFingerprint.js';
export interface RoutesResult {
    routeHints: RouteHint[];
    entrypoints: Entrypoint[];
}
export declare function detectRoutes(projectRoot: string): RoutesResult;
//# sourceMappingURL=detectRoutes.d.ts.map