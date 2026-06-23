/**
 * Plugin — Turpan's extension interface.
 * Plugins contribute analyzers, stages, rulesets, report sections,
 * detectors, fixers, UI scenarios, and commands to the review pipeline.
 */
// ── Type Guard ─────────────────────────────────────────────────────────────────
export function isPlugin(value) {
    return (typeof value === 'object' &&
        value !== null &&
        'manifest' in value &&
        'supports' in value &&
        'register' in value);
}
//# sourceMappingURL=Plugin.js.map