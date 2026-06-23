/**
 * NetworkCollector — intercept and categorize network requests/responses.
 *
 * Identifies:
 * - HTTP error responses (4xx, 5xx)
 * - Failed requests (network-level errors)
 * - App API calls vs external resource loading
 * - Large response bodies
 */

import type { Page, Response, Request } from 'playwright';
import type { NetworkRequest } from './types.js';

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
  private requests: NetworkRequest[] = [];
  private baseUrl: string;
  private onRequest?: (req: NetworkRequest) => void;

  constructor(baseUrl: string, onRequest?: (req: NetworkRequest) => void) {
    this.baseUrl = baseUrl;
    this.onRequest = onRequest;
  }

  /**
   * Attach network listeners to a Playwright page.
   */
  attach(page: Page): void {
    // Collect response info
    page.on('response', (res) => {
      const req = this.processResponse(res);
      this.requests.push(req);
      this.onRequest?.(req);
    });

    // Capture failed requests
    page.on('requestfailed', (req) => {
      const failed: NetworkRequest = {
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

  private processResponse(res: Response): NetworkRequest {
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

  private urlToRoute(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.pathname;
    } catch {
      return url;
    }
  }

  private isAppRequest(url: string): boolean {
    try {
      const parsed = new URL(url);
      const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
      if (!isLocalhost) return false;
      return APP_ROUTE_PATTERNS.some(p => parsed.pathname.startsWith(p)) || parsed.port !== '80' && parsed.port !== '443';
    } catch {
      return false;
    }
  }

  private isExternalRequest(url: string): boolean {
    try {
      const parsed = new URL(url);
      return EXTERNAL_DOMAINS.some(d => parsed.hostname.includes(d));
    } catch {
      return false;
    }
  }

  getRequests(): NetworkRequest[] { return [...this.requests]; }

  getErrors(): NetworkRequest[] {
    return this.requests.filter(r => r.status >= 400 || !!r.failure);
  }

  getAppErrors(): NetworkRequest[] {
    return this.getErrors().filter(r => r.isAppRequest);
  }

  getServerErrors(): NetworkRequest[] {
    return this.requests.filter(r => r.status >= 500);
  }

  getClientErrors(): NetworkRequest[] {
    return this.requests.filter(r => r.status >= 400 && r.status < 500);
  }

  clear(): void { this.requests = []; }

  hasErrors(): boolean { return this.requests.some(r => r.status >= 400 || !!r.failure); }

  summary(): { total: number; errors: number; serverErrors: number; clientErrors: number; failed: number } {
    return {
      total: this.requests.length,
      errors: this.getErrors().length,
      serverErrors: this.getServerErrors().length,
      clientErrors: this.getClientErrors().length,
      failed: this.requests.filter(r => !!r.failure).length,
    };
  }
}