/**
 * NetworkCollector — intercept and categorize network requests/responses.
 *
 * Identifies:
 * - HTTP error responses (4xx, 5xx)
 * - Failed requests (network-level errors)
 * - App API calls vs external resource loading
 * - Large response bodies
 */
import type { Page } from 'playwright';
import type { NetworkRequest } from './types.js';
export declare class NetworkCollector {
    private requests;
    private baseUrl;
    private onRequest?;
    constructor(baseUrl: string, onRequest?: (req: NetworkRequest) => void);
    /**
     * Attach network listeners to a Playwright page.
     */
    attach(page: Page): void;
    private processResponse;
    private urlToRoute;
    private isAppRequest;
    private isExternalRequest;
    getRequests(): NetworkRequest[];
    getErrors(): NetworkRequest[];
    getAppErrors(): NetworkRequest[];
    getServerErrors(): NetworkRequest[];
    getClientErrors(): NetworkRequest[];
    clear(): void;
    hasErrors(): boolean;
    summary(): {
        total: number;
        errors: number;
        serverErrors: number;
        clientErrors: number;
        failed: number;
    };
}
//# sourceMappingURL=NetworkCollector.d.ts.map