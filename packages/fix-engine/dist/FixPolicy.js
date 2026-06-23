/**
 * FixPolicy — encodes which fix categories are allowed, blocked, or require confirmation.
 *
 * Safe by default: most things are blocked unless explicitly declared safe.
 */
// ─── Default Policy ───────────────────────────────────────────────────────────
export const DEFAULT_FIX_POLICY = {
    allowedModes: ['report-only', 'patch-only', 'apply', 'interactive', 'auto-safe'],
    autoSafeCategories: ['safe'],
    minConfidenceThreshold: 70,
    blockedCategories: ['unsafe'],
    allowNewDependencies: false,
    maxDeletionFileSizeKb: 10,
    requireCleanGitTree: true,
};
// ─── Policy Factories ─────────────────────────────────────────────────────────
/**
 * Create a FixPolicy tailored to a specific FixMode.
 */
export function policyForMode(mode, overrides = {}) {
    const base = { ...DEFAULT_FIX_POLICY, ...overrides };
    switch (mode) {
        case 'report-only':
            return {
                ...base,
                // In report-only, display what WOULD be fixed (no actual blocking at policy level)
                // The planner's switch case routes candidates to `applied` for display
                blockedCategories: [],
            };
        case 'patch-only':
            return {
                ...base,
                // patch-only generates diffs but does not apply — all categories can be planned
                blockedCategories: ['unsafe'],
            };
        case 'apply':
            return {
                ...base,
                blockedCategories: ['unsafe'],
                requireCleanGitTree: true,
            };
        case 'interactive':
            return {
                ...base,
                blockedCategories: ['unsafe'],
                requireCleanGitTree: false, // interactive can work on dirty tree but warns
            };
        case 'auto-safe':
            return {
                ...base,
                // Only unsafe is truly blocked. Manual candidates are deferred (require confirmation).
                blockedCategories: ['unsafe'],
                autoSafeCategories: ['safe'],
                requireCleanGitTree: true,
            };
    }
}
/**
 * Merge user-provided overrides with the default policy.
 */
export function mergePolicy(base, overrides) {
    return {
        ...base,
        ...overrides,
        // Arrays need concat, not replace
        allowedModes: overrides.allowedModes ?? base.allowedModes,
        autoSafeCategories: overrides.autoSafeCategories ?? base.autoSafeCategories,
        blockedCategories: overrides.blockedCategories ?? base.blockedCategories,
    };
}
// ─── Policy Queries ───────────────────────────────────────────────────────────
/**
 * Can this category be applied in the given mode without user confirmation?
 */
export function isAutoApplicable(policy, category) {
    if (policy.blockedCategories.includes(category))
        return false;
    return policy.autoSafeCategories.includes(category);
}
/**
 * Is this mode allowed by the policy?
 */
export function isModeAllowed(policy, mode) {
    return policy.allowedModes.includes(mode);
}
/**
 * Should the policy require confirmation before applying?
 */
export function requiresConfirmation(policy, mode, category) {
    if (mode === 'interactive')
        return true; // always confirm in interactive
    if (mode === 'apply' && category === 'manual')
        return true; // manual category needs confirm in apply mode
    if (isAutoApplicable(policy, category))
        return false;
    return true;
}
/**
 * Validate a policy configuration and return errors.
 */
export function validatePolicy(policy) {
    const errors = [];
    if (policy.minConfidenceThreshold < 0 || policy.minConfidenceThreshold > 100) {
        errors.push('minConfidenceThreshold must be between 0 and 100');
    }
    if (policy.maxDeletionFileSizeKb < 0) {
        errors.push('maxDeletionFileSizeKb must be non-negative');
    }
    const unknownModes = policy.allowedModes.filter(m => !['report-only', 'patch-only', 'apply', 'interactive', 'auto-safe'].includes(m));
    if (unknownModes.length > 0) {
        errors.push(`Unknown fix modes: ${unknownModes.join(', ')}`);
    }
    const unknownCategories = policy.blockedCategories.filter(c => !['safe', 'unsafe', 'manual'].includes(c));
    if (unknownCategories.length > 0) {
        errors.push(`Unknown fix categories: ${unknownCategories.join(', ')}`);
    }
    return errors;
}
//# sourceMappingURL=FixPolicy.js.map