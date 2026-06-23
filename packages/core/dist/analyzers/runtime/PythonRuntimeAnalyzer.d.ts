/**
 * PythonRuntimeAnalyzer — runtime safety review for Python bots, CLIs, and workers.
 *
 * Applies to: appType === 'python-bot' | 'fastapi' | 'telegram-bot' | 'worker'
 *
 * Safety guarantees:
 * - Never sends real Telegram messages or calls real external APIs.
 * - Never runs destructive commands (rm -rf, DROP DATABASE, etc.).
 * - Import checks only — does not execute application logic.
 * - Syntax checks via python -m py_compile.
 * - Tool checks (pytest, ruff, mypy) are read-only discovery.
 */
import type { Analyzer, AnalyzerContext, AnalyzerResult } from '../Analyzer.js';
import type { ProjectFingerprint } from '../../project/index.js';
export declare class PythonRuntimeAnalyzer implements Analyzer {
    id: string;
    name: string;
    categories: string[];
    supports(fp: ProjectFingerprint): boolean;
    run(ctx: AnalyzerContext): Promise<AnalyzerResult>;
    private detectEntrypoints;
    private detectRequirements;
    private findPythonFiles;
    private runSyntaxChecks;
    private runToolDiscovery;
    private runPytestChecks;
    private runRuffChecks;
    private runMypyChecks;
    private analyzePatterns;
    private detectSecrets;
    private detectInfiniteLoops;
    private detectUnsafeOperations;
    private detectBareExceptPass;
    private detectBlockingInAsync;
    private detectMissingErrorHandling;
    private detectMissingRetry;
    private detectWebhookPollingAmbiguity;
    private checkEntrypoints;
}
//# sourceMappingURL=PythonRuntimeAnalyzer.d.ts.map