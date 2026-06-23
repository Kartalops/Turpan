/**
 * FindingMapper — convert collected UI observations into structured Findings.
 *
 * Maps raw observations → categorized Findings with severity, evidence, and tags.
 */
import { confidence } from '@turpan/core';
import { createEvidence } from '@turpan/core';
const CONFIDENCE_BASE = 85;
function mapSeverity(rules) {
    if (rules.critical)
        return 'critical';
    if (rules.high)
        return 'high';
    if (rules.medium)
        return 'medium';
    return 'low';
}
export function mapConsoleErrors(entries, route) {
    const findings = [];
    for (const entry of entries) {
        if (!entry.isRuntimeError && entry.type !== 'error')
            continue;
        let severity = 'high';
        let title = 'Console runtime error';
        if (entry.isHydrationError) {
            severity = 'high';
            title = 'React hydration error';
        }
        findings.push({
            id: `ui-console-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
            title,
            severity,
            category: 'ui',
            file: entry.url,
            line: entry.line,
            explanation: `Browser console recorded a ${entry.type} on route ${route}:\n${entry.text}${entry.line ? ` (line ${entry.line})` : ''}`,
            evidence: [createEvidence('console', {
                    excerpt: entry.text,
                    url: entry.url,
                    metadata: {
                        type: entry.type,
                        isRuntimeError: String(entry.isRuntimeError),
                        isHydrationError: String(entry.isHydrationError),
                        route,
                    },
                })],
            fixable: 'none',
            confidence: confidence(entry.isHydrationError ? 95 : 90),
            tags: ['ui', 'runtime-error', entry.isHydrationError ? 'hydration' : 'console-error', route],
        });
    }
    return findings;
}
export function mapNetworkErrors(requests, route) {
    const findings = [];
    for (const req of requests) {
        if (req.status < 400 && !req.failure)
            continue;
        let severity = 'medium';
        let title = 'Network request failure';
        if (req.status === 500 || req.status === 502 || req.status === 503) {
            severity = 'high';
            title = 'Server error response';
        }
        else if (req.status === 404 && req.isAppRequest) {
            severity = 'medium';
            title = 'Missing app resource (404)';
        }
        else if (req.status === 401 || req.status === 403) {
            severity = 'high';
            title = 'Auth-related network error';
        }
        else if (req.failure) {
            severity = 'high';
            title = 'Network request failed';
        }
        findings.push({
            id: `ui-network-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
            title,
            severity,
            category: 'ui',
            explanation: `Network ${req.failure ? 'failure' : `HTTP ${req.status}`} for ${req.method} ${req.url} on route ${route}${req.failure ? `: ${req.failure}` : ''}`,
            evidence: [createEvidence('network', {
                    excerpt: `${req.method} ${req.url} → ${req.failure ?? `HTTP ${req.status} ${req.statusText}`}`,
                    url: req.url,
                    metadata: {
                        status: req.status,
                        method: req.method,
                        route,
                        isAppRequest: String(req.isAppRequest),
                        failure: req.failure ?? '',
                    },
                })],
            fixable: 'none',
            confidence: confidence(95),
            tags: ['ui', 'network-error', `http-${req.status}`, route],
        });
    }
    return findings;
}
export function mapFailedInteractions(results, route) {
    const findings = [];
    for (const result of results) {
        if (result.success)
            continue;
        // Check if it's a "no-op" button (clickable but does nothing)
        const isClickInteraction = result.step.type === 'click' && result.step.selector;
        findings.push({
            id: `ui-interaction-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
            title: `Interaction failed: ${result.step.description}`,
            severity: isClickInteraction ? 'medium' : 'low',
            category: 'ui',
            explanation: `Failed to ${result.step.type} on route ${route}: ${result.step.description}${result.error ? `: ${result.error}` : ''}`,
            evidence: [createEvidence('command-log', {
                    excerpt: `${result.step.type} → ${result.step.description} (failed: ${result.error ?? 'unknown'})`,
                    metadata: { route, stepType: result.step.type, selector: result.step.selector ?? '' },
                })],
            fixable: 'none',
            confidence: confidence(CONFIDENCE_BASE),
            tags: ['ui', 'interaction-failure', route],
        });
    }
    return findings;
}
export function mapResponsiveIssues(results) {
    const findings = [];
    for (const result of results) {
        if (!result.hasHorizontalOverflow)
            continue;
        findings.push({
            id: `ui-responsive-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
            title: `Horizontal overflow on ${result.viewport.name} (${result.viewport.width}px)`,
            severity: 'medium',
            category: 'ui',
            explanation: `Page has ${result.overflowPixels}px of horizontal overflow on ${result.viewport.name} viewport (${result.viewport.width}×${result.viewport.height}). This causes horizontal scroll which degrades the mobile experience.`,
            evidence: [createEvidence('screenshot', {
                    label: `${result.viewport.name}-viewport`,
                    metadata: {
                        viewport: result.viewport.name,
                        width: result.viewport.width,
                        height: result.viewport.height,
                        overflowPixels: result.overflowPixels ?? 0,
                    },
                })],
            fixable: 'manual',
            confidence: confidence(90),
            tags: ['ui', 'responsive', 'horizontal-overflow', result.viewport.name],
        });
    }
    return findings;
}
export function mapAccessibilityIssues(results, route) {
    const findings = [];
    for (const result of results) {
        for (const issue of result.issues) {
            findings.push({
                id: `ui-a11y-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
                title: `Accessibility: ${issue.description}`,
                severity: issue.severity === 'critical' || issue.severity === 'serious' ? 'high' : 'medium',
                category: 'accessibility',
                file: issue.selector,
                line: undefined,
                explanation: `${issue.description}${issue.wcagCriteria ? `\n\n${issue.wcagCriteria}` : ''}`,
                evidence: [createEvidence('command-log', {
                        excerpt: issue.description,
                        metadata: {
                            severity: issue.severity,
                            route,
                            viewport: result.viewport.name,
                            wcagCriteria: issue.wcagCriteria ?? '',
                        },
                    })],
                fixable: 'manual',
                confidence: confidence(issue.severity === 'critical' ? 95 : 80),
                tags: ['ui', 'accessibility', issue.severity, route],
            });
        }
    }
    return findings;
}
export function mapBlankPage(route) {
    return {
        id: `ui-blank-${Date.now().toString(36)}`,
        title: 'Page appears blank or did not load',
        severity: 'critical',
        category: 'ui',
        explanation: `Route ${route} returned a blank or near-empty page. This may indicate a runtime error, failed JavaScript bundle, or missing page component.`,
        evidence: [createEvidence('command-log', {
                excerpt: `Blank page detected on route: ${route}`,
                metadata: { route },
            })],
        fixable: 'none',
        confidence: confidence(90),
        tags: ['ui', 'critical', 'blank-page', route],
    };
}
export function mapNoOpButton(buttonText, route) {
    return {
        id: `ui-noop-${Date.now().toString(36)}`,
        title: `Button appears to be a no-op: "${buttonText}"`,
        severity: 'high',
        category: 'ui',
        explanation: `Button "${buttonText}" on route ${route} is clickable but produces no visible action or network request. This may indicate a placeholder button or incomplete implementation.`,
        evidence: [createEvidence('command-log', {
                excerpt: `No-op button detected: "${buttonText}" on ${route}`,
                metadata: { route, buttonText },
            })],
        fixable: 'manual',
        confidence: confidence(70),
        tags: ['ui', 'no-op-button', route],
    };
}
export function determineVerdict(routes, consoleErrors, networkErrors, interactionFailures, canStartServer) {
    const failedRoutes = routes.filter(r => !r.loaded).length;
    const totalRoutes = routes.length || 1;
    const runtimeErrors = consoleErrors.filter(e => e.isRuntimeError).length;
    const hydrationErrors = consoleErrors.filter(e => e.isHydrationError).length;
    const serverErrors = networkErrors.filter(n => n.status >= 500).length;
    if (!canStartServer) {
        return { verdict: 'cannot_start', reason: 'Could not start the development server' };
    }
    if (failedRoutes / totalRoutes >= 0.7) {
        return { verdict: 'broken', reason: `${failedRoutes}/${totalRoutes} routes failed to load` };
    }
    if (runtimeErrors >= 5 || hydrationErrors >= 3) {
        return { verdict: 'broken', reason: `Multiple runtime/hydration errors (${runtimeErrors} runtime, ${hydrationErrors} hydration)` };
    }
    if (serverErrors >= 3) {
        return { verdict: 'partially_usable', reason: `Multiple server errors: ${serverErrors}` };
    }
    if (failedRoutes / totalRoutes >= 0.3) {
        return { verdict: 'partially_usable', reason: `${failedRoutes}/${totalRoutes} routes failed` };
    }
    if (runtimeErrors >= 2 || hydrationErrors >= 1) {
        return { verdict: 'partially_usable', reason: `Console errors present (${runtimeErrors} runtime)` };
    }
    return { verdict: 'usable', reason: 'All critical checks passed' };
}
//# sourceMappingURL=UiFindingMapper.js.map