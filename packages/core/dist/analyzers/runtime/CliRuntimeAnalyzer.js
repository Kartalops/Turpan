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
import { createFinding, confidence } from '../../findings/Finding.js';
import { createEvidence } from '../../findings/Evidence.js';
import { readFile, access } from 'fs/promises';
import { join } from 'path';
import { SafeCommandRunner } from '../../runner/SafeCommandRunner.js';
export class CliRuntimeAnalyzer {
    id = 'cli-runtime';
    name = 'CLI Runtime Analyzer';
    categories = ['runtime', 'cli'];
    supports(fp) {
        // Apply if there are bin entries in package.json or [project.scripts] in pyproject.toml
        if (fp.packageScripts && Object.keys(fp.packageScripts).length > 0) {
            return true;
        }
        if (fp.entrypoints && fp.entrypoints.some(e => e.type === 'cli')) {
            return true;
        }
        return false;
    }
    async run(ctx) {
        const errors = [];
        const findings = [];
        // 1. Detect CLI entrypoints
        const entrypoints = await this.detectEntrypoints(ctx.projectRoot);
        if (entrypoints.length === 0) {
            return { analyzerId: this.id, findings: [], durationMs: 0, errors: [] };
        }
        // 2. Run help/version checks for each entrypoint
        const runner = new SafeCommandRunner({
            projectRoot: ctx.projectRoot,
            runId: `cli-runtime-${Date.now()}`,
            defaultTimeoutMs: 30_000,
        });
        for (const ep of entrypoints) {
            const helpResult = await this.runHelpCheck(runner, ctx.projectRoot, ep);
            findings.push(...helpResult.findings);
            errors.push(...helpResult.errors);
            const versionResult = await this.runVersionCheck(runner, ctx.projectRoot, ep);
            findings.push(...versionResult.findings);
            // 3. Check for broken command registration
            const brokenCmdFindings = await this.checkCommandRegistration(ctx.projectRoot, ep);
            findings.push(...brokenCmdFindings);
        }
        return {
            analyzerId: this.id,
            findings,
            artifacts: { entrypoints },
            durationMs: 0,
            errors,
        };
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Entrypoint detection
    // ─────────────────────────────────────────────────────────────────────────
    async detectEntrypoints(projectRoot) {
        const entrypoints = [];
        // Check package.json bin
        try {
            const pkg = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf-8'));
            if (pkg.bin) {
                for (const [cmd, file] of Object.entries(pkg.bin)) {
                    entrypoints.push(file);
                }
            }
            // Also check scripts for CLI-like scripts
            if (pkg.scripts) {
                for (const [name, cmd] of Object.entries(pkg.scripts)) {
                    if (['cli', 'console', 'bin', 'cmd'].some(k => name.toLowerCase().includes(k))) {
                        entrypoints.push(cmd);
                    }
                }
            }
        }
        catch {
            // not found
        }
        // Check pyproject.toml [project.scripts]
        try {
            const content = await readFile(join(projectRoot, 'pyproject.toml'), 'utf-8');
            const scriptRe = /^\[project\.scripts\]\s*\n((?:[^\[\]]+\n?)+)/gm;
            const match = scriptRe.exec(content);
            if (match) {
                const lines = match[1].split('\n').filter(l => l.includes('='));
                for (const line of lines) {
                    const [cmd, val] = line.split('=').map(s => s.trim());
                    if (cmd && val)
                        entrypoints.push(val.replace(/["' ]/g, '').split(' ')[0]);
                }
            }
        }
        catch {
            // not found
        }
        // Check for common Python CLI entrypoints
        const pyCandidates = ['cli.py', 'main.py', '__main__.py'];
        for (const candidate of pyCandidates) {
            try {
                await access(join(projectRoot, candidate));
                const content = await readFile(join(projectRoot, candidate), 'utf-8');
                if (/\bif\s+__name__\s*==\s*["']__main__["']/.test(content)) {
                    if (!entrypoints.includes(candidate))
                        entrypoints.push(candidate);
                }
            }
            catch {
                // not found
            }
        }
        return [...new Set(entrypoints)];
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Help check
    // ─────────────────────────────────────────────────────────────────────────
    async runHelpCheck(runner, projectRoot, entrypoint) {
        const findings = [];
        const errors = [];
        const ext = entrypoint.split('.').pop();
        let cmd;
        let args;
        if (['js', 'ts', 'mjs'].includes(ext ?? '')) {
            cmd = 'node';
            args = [entrypoint, '--help'];
        }
        else if (ext === 'py') {
            cmd = 'python';
            args = [entrypoint, '--help'];
        }
        else {
            cmd = entrypoint;
            args = ['--help'];
        }
        const result = await runner.run(`${cmd} ${args.join(' ')}`, {
            cwd: projectRoot,
            saveLog: false,
            stageName: 'cli-help-check',
            timeoutMs: 15_000,
        });
        if (result.blocked) {
            findings.push(createFinding({
                id: `cli-help-blocked-${entrypoint.replace(/[^a-z0-9]/gi, '-')}`,
                title: `CLI help command blocked: ${entrypoint}`,
                explanation: `Running \`${cmd} ${args.join(' ')}\` was blocked by the safe command policy. This may indicate a misconfiguration or overly restrictive policy.`,
                severity: 'medium',
                category: 'runtime',
                fixable: 'manual',
                confidence: confidence(60),
                tags: ['cli', 'policy', 'blocked'],
                evidence: [
                    createEvidence('text', { label: 'block-reason', excerpt: result.blockReason ?? 'unknown' }),
                ],
                suggestedFix: `Check that the command policy allows running CLI help commands.`,
            }));
            return { findings, errors };
        }
        if (result.exitCode !== 0) {
            findings.push(createFinding({
                id: `cli-help-failed-${entrypoint.replace(/[^a-z0-9]/gi, '-')}`,
                title: `CLI --help failed with exit code ${result.exitCode}: ${entrypoint}`,
                explanation: `\`${cmd} ${args.join(' ')}\` exited with code ${result.exitCode}. A CLI tool that fails --help is broken — users cannot discover how to use it.`,
                severity: 'high',
                category: 'runtime',
                fixable: 'manual',
                confidence: confidence(90),
                tags: ['cli', 'help', 'exit-code', 'broken'],
                evidence: [
                    createEvidence('command-log', {
                        label: 'exit-code',
                        excerpt: String(result.exitCode),
                        timestamp: new Date().toISOString(),
                    }),
                    createEvidence('text', { label: 'stdout', excerpt: result.stdout?.slice(0, 300) ?? '' }),
                    createEvidence('text', { label: 'stderr', excerpt: result.stderr?.slice(0, 300) ?? '' }),
                ],
                suggestedFix: `Fix the CLI so \`${cmd} ${args.join(' ')}\` exits with code 0 and shows help text. Common causes: missing dependency, sys.argv mishandling, or missing click/argparse setup.`,
            }));
            errors.push(`help failed for ${entrypoint}: exit code ${result.exitCode}`);
        }
        else {
            // Help succeeded — check content
            const helpText = (result.stdout || result.stderr || '').toLowerCase();
            const hasUsefulContent = helpText.length > 50;
            const hasUsageLine = /usage|Usage/.test(helpText);
            const hasCommands = /commands|Options|Arguments|Subcommands/i.test(helpText);
            if (!hasUsefulContent || (!hasUsageLine && !hasCommands)) {
                findings.push(createFinding({
                    id: `cli-help-useless-${entrypoint.replace(/[^a-z0-9]/gi, '-')}`,
                    title: `CLI --help shows minimal/no content: ${entrypoint}`,
                    explanation: `\`${cmd} ${args.join(' ')}\` exited 0 but produced almost no help text. Users cannot discover how to use this CLI.`,
                    severity: 'medium',
                    category: 'runtime',
                    fixable: 'manual',
                    confidence: confidence(75),
                    tags: ['cli', 'help', 'useless'],
                    evidence: [
                        createEvidence('metric', { value: helpText.length, unit: 'chars', label: 'help-length' }),
                    ],
                    suggestedFix: `Improve the --help output to include usage information, available commands, and argument descriptions using a CLI framework like Click, argparse, or Typer.`,
                }));
            }
        }
        return { findings, errors };
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Version check
    // ─────────────────────────────────────────────────────────────────────────
    async runVersionCheck(runner, projectRoot, entrypoint) {
        const findings = [];
        const errors = [];
        const ext = entrypoint.split('.').pop();
        let cmd;
        let args;
        if (['js', 'ts', 'mjs'].includes(ext ?? '')) {
            cmd = 'node';
            args = [entrypoint, '--version'];
        }
        else if (ext === 'py') {
            cmd = 'python';
            args = [entrypoint, '--version'];
        }
        else {
            cmd = entrypoint;
            args = ['--version'];
        }
        const result = await runner.run(`${cmd} ${args.join(' ')}`, {
            cwd: projectRoot,
            saveLog: false,
            stageName: 'cli-version-check',
            timeoutMs: 10_000,
        });
        if (result.blocked || result.exitCode !== 0) {
            // Version failure is a low-severity finding (version is optional)
            findings.push(createFinding({
                id: `cli-version-failed-${entrypoint.replace(/[^a-z0-9]/gi, '-')}`,
                title: `CLI --version not available: ${entrypoint}`,
                explanation: `\`${cmd} ${args.join(' ')}\` exited with code ${result.exitCode ?? 'blocked'}. Version information is helpful for debugging but not critical.`,
                severity: 'low',
                category: 'runtime',
                fixable: 'manual',
                confidence: confidence(60),
                tags: ['cli', 'version', 'missing'],
                evidence: [
                    createEvidence('text', { label: 'exit-code', excerpt: String(result.exitCode ?? 'blocked') }),
                ],
                suggestedFix: `Add --version support to the CLI for better debuggability.`,
            }));
        }
        return { findings, errors };
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Command registration checks
    // ─────────────────────────────────────────────────────────────────────────
    async checkCommandRegistration(projectRoot, entrypoint) {
        const findings = [];
        const ext = entrypoint.split('.').pop();
        if (!['js', 'ts', 'mjs', 'py'].includes(ext ?? ''))
            return findings;
        try {
            const content = await readFile(join(projectRoot, entrypoint), 'utf-8');
            // For Node CLIs using commander/yargs: check if .parse() or .parseAsync() is called
            const hasCommander = /commander|yargs|clipanion|oclif|Sherlock/i.test(content);
            if (hasCommander) {
                const hasParse = /\.parse|\.parseAsync/.test(content);
                if (!hasParse) {
                    findings.push(createFinding({
                        id: `cli-no-parse-${entrypoint.replace(/[^a-z0-9]/gi, '-')}`,
                        title: `CLI library detected but .parse() not called in ${entrypoint}`,
                        explanation: `A CLI framework (commander/yargs) is imported in "${entrypoint}" but .parse() is not called. The CLI will not process arguments.`,
                        severity: 'high',
                        category: 'runtime',
                        file: join(projectRoot, entrypoint),
                        fixable: 'manual',
                        confidence: confidence(80),
                        tags: ['cli', 'commander', 'parse', 'broken'],
                        evidence: [
                            createEvidence('text', { label: 'entrypoint', excerpt: entrypoint }),
                        ],
                        suggestedFix: `Add \`program.parse(process.argv)\` (commander) or \`yargs.parse()\` at the end of your CLI file.`,
                    }));
                }
            }
            // For Python: check if Typer/Click has a proper app callable
            const hasClickTyper = /click|typer|from click|import typer/i.test(content);
            if (hasClickTyper) {
                // Check for app definition
                const hasAppDef = /app\s*=|typer\.Typer\(\)|click\.Command\(\)/.test(content);
                const hasMainCall = /if\s+__name__\s*==\s*["']__main__["']|app\(\)/.test(content);
                if (!hasAppDef && !hasMainCall) {
                    findings.push(createFinding({
                        id: `cli-python-no-app-${entrypoint.replace(/[^a-z0-9]/gi, '-')}`,
                        title: `Python CLI framework found but no app invocation in ${entrypoint}`,
                        explanation: `A Python CLI framework (Click/Typer) is used in "${entrypoint}" but no app is defined or called. The CLI will not execute.`,
                        severity: 'high',
                        category: 'runtime',
                        file: join(projectRoot, entrypoint),
                        fixable: 'manual',
                        confidence: confidence(80),
                        tags: ['cli', 'python', 'click', 'typer', 'broken'],
                        evidence: [
                            createEvidence('text', { label: 'entrypoint', excerpt: entrypoint }),
                        ],
                        suggestedFix: `Ensure your CLI app is properly defined and called: \`if __name__ == "__main__": app()\` (Typer) or \`cli()\` (Click).`,
                    }));
                }
            }
        }
        catch {
            // skip unreadable
        }
        return findings;
    }
}
//# sourceMappingURL=CliRuntimeAnalyzer.js.map