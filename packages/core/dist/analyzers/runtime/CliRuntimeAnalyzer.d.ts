/**
 * CliRuntimeAnalyzer — runtime safety review for CLI tools.
 *
 * Applies to: any project with bin/console entrypoints in package.json or pyproject.toml
 *
 * Safety guarantees:
 * - Never runs destructive commands.
 * - Runs help/version commands only.
 * - Validates exit codes on --help and --version.
 */
import type { Analyzer, AnalyzerContext, AnalyzerResult } from '../Analyzer.js';
import type { ProjectFingerprint } from '../../project/index.js';
export declare class CliRuntimeAnalyzer implements Analyzer {
    id: string;
    name: string;
    categories: string[];
    supports(fp: ProjectFingerprint): boolean;
    run(ctx: AnalyzerContext): Promise<AnalyzerResult>;
    private detectEntrypoints;
    private runHelpCheck;
    private runVersionCheck;
    private checkCommandRegistration;
}
//# sourceMappingURL=CliRuntimeAnalyzer.d.ts.map