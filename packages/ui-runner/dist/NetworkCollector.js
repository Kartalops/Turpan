/**
 * NetworkCollector — intercept and categorize network requests/responses.
 *
 * Identifies:
 * - HTTP error responses (4xx, 5xx)
 * - Failed requests (network-level errors)
 * - App API calls vs external resource loading
 * - Large response bodies
 */
const EXTERNAL_DOMAINS = [
    'google.com', 'googleapis.com', 'google-analytics.com',
    'facebook.com', 'fbcdn.net', 'connect.facebook.net',
    'twitter.com', 'twimg.com',
    'github.com', 'githubusercontent.com',
    'stripe.com', 'paypal.com',
    'intercom.io', 'segment.io', 'segment.com',
    'mixpanel.com', 'amplitude.com',
    'hotjar.com', 'fullstory.com',
    'sentry.io', 'bugsnag.com',
    'cdn.jsdelivr.net', 'unpkg.com', 'cdnjs.cloudflare.com',
    'jsdelivr.net', 'unpkg.com',
];
const APP_ROUTE_PATTERNS = [
    '/api/', '/_next/', '/__nextjs/', '/auth/', '/login', '/register',
    '/api/v', '/graphql', '/webhook', '/upload', '/download',
];
export class NetworkCollector {
    requests = [];
    baseUrl;
    onRequest;
    constructor(baseUrl, onRequest) {
        this.baseUrl = baseUrl;
        this.onRequest = onRequest;
    }
    /**
     * Attach network listeners to a Playwright page.
     */
    attach(page) {
        // Collect response info
        page.on('response', (res) => {
            const req = this.processResponse(res);
            this.requests.push(req);
            this.onRequest?.(req);
        });
        // Capture failed requests
        page.on('requestfailed', (req) => {
            const failed = {
                url: req.url(),
                method: req.method(),
                route: this.urlToRoute(req.url()),
                status: 0,
                statusText: 'FAILED',
                failure: req.failure()?.errorText,
                resourceType: req.resourceType(),
                isAppRequest: this.isAppRequest(req.url()),
                isExternalRequest: this.isExternalRequest(req.url()),
                timestamp: new Date().toISOString(),
            };
            this.requests.push(failed);
            this.onRequest?.(failed);
        });
    }
    processResponse(res) {
        const url = res.url();
        return {
            url,
            method: res.request().method(),
            route: this.urlToRoute(url),
            status: res.status(),
            statusText: res.statusText(),
            responseBodySize: undefined, // body size not available on Playwright Response
            resourceType: res.request().resourceType(),
            isAppRequest: this.isAppRequest(url),
            isExternalRequest: this.isExternalRequest(url),
            timestamp: new Date().toISOString(),
        };
    }
    urlToRoute(url) {
        try {
            const parsed = new URL(url);
            return parsed.pathname;
        }
        catch {
            return url;
        }
    }
    isAppRequest(url) {
        try {
            const parsed = new URL(url);
            const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
            if (!isLocalhost)
                return false;
            return APP_ROUTE_PATTERNS.some(p => parsed.pathname.startsWith(p)) || parsed.port !== '80' && parsed.port !== '443';
        }
        catch {
            return false;
        }
    }
    isExternalRequest(url) {
        try {
            const parsed = new URL(url);
            return EXTERNAL_DOMAINS.some(d => parsed.hostname.includes(d));
        }
        catch {
            return false;
        }
    }
    getRequests() { return [...this.requests]; }
    getErrors() {
        return this.requests.filter(r => r.status >= 400 || !!r.failure);
    }
    getAppErrors() {
        return this.getErrors().filter(r => r.isAppRequest);
    }
    getServerErrors() {
        return this.requests.filter(r => r.status >= 500);
    }
    getClientErrors() {
        return this.requests.filter(r => r.status >= 400 && r.status < 500);
    }
    clear() { this.requests = []; }
    hasErrors() { return this.requests.some(r => r.status >= 400 || !!r.failure); }
    summary() {
        return {
            total: this.requests.length,
            errors: this.getErrors().length,
            serverErrors: this.getServerErrors().length,
            clientErrors: this.getClientErrors().length,
            failed: this.requests.filter(r => !!r.failure).length,
        };
    }
}
//# sourceMappingURL=NetworkCollector.js.map