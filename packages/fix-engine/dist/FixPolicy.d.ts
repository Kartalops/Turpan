/**
 * FixPolicy — encodes which fix categories are allowed, blocked, or require confirmation.
 *
 * Safe by default: most things are blocked unless explicitly declared safe.
 */
import type { FixMode, FixPolicy, FixCategory } from './types.js';
export declare const DEFAULT_FIX_POLICY: FixPolicy;
/**
 * Create a FixPolicy tailored to a specific FixMode.
 */
export declare function policyForMode(mode: FixMode, overrides?: Partial<FixPolicy>): FixPolicy;
/**
 * Merge user-provided overrides with the default policy.
 */
export declare function mergePolicy(base: FixPolicy, overrides: Partial<FixPolicy>): FixPolicy;
/**
 * Can this category be applied in the given mode without user confirmation?
 */
export declare function isAutoApplicable(policy: FixPolicy, category: FixCategory): boolean;
/**
 * Is this mode allowed by the policy?
 */
export declare function isModeAllowed(policy: FixPolicy, mode: FixMode): boolean;
/**
 * Should the policy require confirmation before applying?
 */
export declare function requiresConfirmation(policy: FixPolicy, mode: FixMode, category: FixCategory): boolean;
/**
 * Validate a policy configuration and return errors.
 */
export declare function validatePolicy(policy: FixPolicy): string[];
//# sourceMappingURL=FixPolicy.d.ts.map