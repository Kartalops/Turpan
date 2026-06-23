/**
 * @turpan/git-diff — Read-only git diff detection and analysis
 *
 * Safe for CI: all operations are read-only. No git commit, push, reset, or history modification.
 */

export * from './types.js';
export { GitDiffEngine, isPathAffectedByDiff, computeDiffRecommendation } from './GitDiffEngine.js';