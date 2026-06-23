/**
 * PatchVerifier — validates patches by running project quality checks.
 *
 * Checks run:
 *  - build     → npm/package build script
 *  - typecheck → tsc --noEmit or equivalent
 *  - lint      → project linter (eslint, ruff, etc.)
 *  - test      → project test script
 *  - ui-test   → targeted UI test (if UI finding was fixed)
 *
 * Runs checks in parallel for efficiency.
 * Short-circuits on critical failure (build/typecheck).
 */
import type { ValidationCheck, ValidationSummary, FixCandidate } from './types.js';
export interface VerifyOptions {
    projectRoot: string;
    /** Which checks to run (inferred from candidates if not provided) */
    checks?: ValidationCheck[];
    /** Timeout per check in ms */
    timeoutMs?: number;
    /** Package manager (npm/pnpm/yarn) */
    packageManager?: 'npm' | 'pnpm' | 'yarn';
    /** Custom typecheck command */
    typecheckCmd?: string;
    /** Custom lint command */
    lintCmd?: string;
    /** Custom build command */
    buildCmd?: string;
    /** Custom test command */
    testCmd?: string;
}
/**
 * Run all required validation checks.
 * Runs non-blocking checks in parallel; blocks on build/typecheck results.
 */
export declare function verifyPatch(candidates: FixCandidate[], opts: VerifyOptions): Promise<ValidationSummary>;
/**
 * Should we rollback given a validation failure?
 * Only rollback on blocking check failures (build, typecheck).
 */
export declare function shouldRollback(summary: ValidationSummary): boolean;
//# sourceMappingURL=PatchVerifier.d.ts.map