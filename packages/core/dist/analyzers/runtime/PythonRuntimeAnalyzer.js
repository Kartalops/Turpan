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
import { createFinding, confidence } from '../../findings/Finding.js';
import { createEvidence } from '../../findings/Evidence.js';
import { readFile, access } from 'fs/promises';
import { join, relative } from 'path';
import { walkFiles } from '../../shared/index.js';
import { SafeCommandRunner } from '../../runner/SafeCommandRunner.js';
const WORLD_WRITABLE_CMD_PATTERNS = [
    'curl http', 'wget http', 'requests.', 'aiohttp.', 'httpx.',
];
export class PythonRuntimeAnalyzer {
    id = 'python-runtime';
    name = 'Python Runtime Analyzer';
    categories = ['runtime', 'python', 'bot', 'worker'];
    supports(fp) {
        return (fp.languages.includes('python') &&
            (fp.appType === 'python-bot' ||
                fp.appType === 'telegram-bot' ||
                fp.appType === 'fastapi' ||
                fp.appType === 'mcp-server' ||
                fp.appType === 'unknown'));
    }
    async run(ctx) {
        const errors = [];
        const findings = [];
        // 1. Discover entrypoints
        const entrypoints = await this.detectEntrypoints(ctx.projectRoot);
        const requirements = await this.detectRequirements(ctx.projectRoot);
        const pythonFiles = await this.findPythonFiles(ctx.projectRoot);
        if (pythonFiles.length === 0) {
            return { analyzerId: this.id, findings: [], durationMs: 0, errors: [] };
        }
        // 2. Run safe syntax/import checks
        const syntaxResults = await this.runSyntaxChecks(ctx.projectRoot, pythonFiles);
        findings.push(...syntaxResults.findings);
        errors.push(...syntaxResults.errors);
        // 3. Run tool discovery (pytest, ruff, mypy)
        const toolResults = await this.runToolDiscovery(ctx.projectRoot, pythonFiles);
        findings.push(...toolResults.findings);
        errors.push(...toolResults.errors);
        // 4. Static pattern analysis
        const patternFindings = await this.analyzePatterns(ctx.projectRoot, pythonFiles);
        findings.push(...patternFindings);
        // 5. Entrypoint-specific checks
        if (entrypoints.length > 0) {
            const epFindings = await this.checkEntrypoints(ctx.projectRoot, entrypoints);
            findings.push(...epFindings);
        }
        return {
            analyzerId: this.id,
            findings,
            artifacts: {
                entrypoints,
                requirements,
                pythonFileCount: pythonFiles.length,
                syntaxCheckPassed: syntaxResults.errors.length === 0,
                toolsAvailable: toolResults.artifacts,
            },
            durationMs: 0,
            errors,
        };
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Entrypoint detection
    // ─────────────────────────────────────────────────────────────────────────
    async detectEntrypoints(projectRoot) {
        const candidates = [
            'main.py',
            'bot.py',
            'app.py',
            'run.py',
            'worker.py',
            'cli.py',
            'src/main.py',
            'src/bot.py',
            'src/app.py',
            'src/run.py',
        ];
        const found = [];
        for (const candidate of candidates) {
            try {
                await access(join(projectRoot, candidate));
                found.push(candidate);
            }
            catch {
                // not found
            }
        }
        return found;
    }
    async detectRequirements(projectRoot) {
        const requirements = {};
        const files = [
            'requirements.txt',
            'pyproject.toml',
            'uv.lock',
        ];
        for (const file of files) {
            try {
                const content = await readFile(join(projectRoot, file), 'utf-8');
                requirements[file] = content;
            }
            catch {
                // not found
            }
        }
        return requirements;
    }
    async findPythonFiles(projectRoot) {
        const ignoredDirs = new Set(['node_modules', '.git', '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache', '.turpan', 'dist', 'build', '.venv', 'venv']);
        return walkFiles({
            cwd: projectRoot,
            extensions: ['py'],
            ignoreDirs: ignoredDirs,
        });
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Safe syntax & import checks
    // ─────────────────────────────────────────────────────────────────────────
    async runSyntaxChecks(projectRoot, pythonFiles) {
        const findings = [];
        const errors = [];
        // Build a lightweight SafeCommandRunner for checks
        const runner = new SafeCommandRunner({
            projectRoot,
            runId: `python-runtime-${Date.now()}`,
            defaultTimeoutMs: 30_000,
        });
        // Run python -m py_compile on entrypoint-adjacent files (max 10)
        const targets = pythonFiles.slice(0, 10);
        for (const file of targets) {
            const relPath = relative(projectRoot, file);
            const result = await runner.run(`python -m py_compile ${file}`, {
                cwd: projectRoot,
                saveLog: false,
                stageName: 'python-syntax-check',
            });
            if (result.blocked || result.exitCode !== 0) {
                const reason = result.blockReason ?? result.stderr ?? 'syntax error';
                findings.push(createFinding({
                    id: `python-syntax-error-${relPath.replace(/[^a-z0-9]/gi, '-')}`,
                    title: `Python syntax error in ${relPath}`,
                    explanation: `\`python -m py_compile\` failed for "${relPath}": ${reason}. This file will fail at runtime.`,
                    severity: 'high',
                    category: 'runtime',
                    file,
                    fixable: 'manual',
                    confidence: confidence(90),
                    tags: ['python', 'syntax-error', 'runtime'],
                    evidence: [
                        createEvidence('command-log', {
                            label: 'py_compile',
                            excerpt: `python -m py_compile ${file} → ${result.exitCode ?? 'blocked'}`,
                            timestamp: new Date().toISOString(),
                        }),
                        createEvidence('text', {
                            label: 'stderr',
                            excerpt: result.stderr?.slice(0, 300) ?? reason,
                        }),
                    ],
                    suggestedFix: `Fix the Python syntax in "${relPath}". Run \`python -m py_compile ${relPath}\` locally to see the exact error.`,
                }));
                if (!result.blocked) {
                    errors.push(`syntax error in ${relPath}: ${result.stderr}`);
                }
            }
        }
        // Run python -c "import <module>" for top-level packages found
        // Only try top-level dirs that look like packages (contain __init__.py)
        const pkgDirs = new Set();
        for (const file of pythonFiles) {
            const dir = join(projectRoot, relative(projectRoot, file));
            if (file.endsWith('__init__.py')) {
                const pkg = relative(projectRoot, dir).replace(/\\/g, '/');
                pkgDirs.add(pkg.split('/')[0]);
            }
        }
        return { findings, errors };
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Tool discovery (pytest, ruff, mypy)
    // ─────────────────────────────────────────────────────────────────────────
    async runToolDiscovery(projectRoot, pythonFiles) {
        const findings = [];
        const errors = [];
        const artifacts = {};
        const tools = ['pytest', 'ruff', 'mypy', 'black', 'isort'];
        const runner = new SafeCommandRunner({
            projectRoot,
            runId: `python-runtime-${Date.now()}`,
            defaultTimeoutMs: 15_000,
        });
        for (const tool of tools) {
            const result = await runner.run(`${tool} --version`, {
                cwd: projectRoot,
                saveLog: false,
                stageName: `tool-discovery-${tool}`,
            });
            artifacts[tool] = !result.blocked && result.exitCode === 0;
            if (artifacts[tool]) {
                // Tool is available — run a safe check
                if (tool === 'pytest') {
                    const pytestResult = await this.runPytestChecks(runner, projectRoot);
                    findings.push(...pytestResult.findings);
                    errors.push(...pytestResult.errors);
                }
                else if (tool === 'ruff') {
                    const ruffResult = await this.runRuffChecks(runner, projectRoot, pythonFiles);
                    findings.push(...ruffResult.findings);
                    errors.push(...ruffResult.errors);
                }
                else if (tool === 'mypy') {
                    const mypyResult = await this.runMypyChecks(runner, projectRoot, pythonFiles);
                    findings.push(...mypyResult.findings);
                    errors.push(...mypyResult.errors);
                }
            }
        }
        return { findings, errors, artifacts };
    }
    async runPytestChecks(runner, projectRoot) {
        const findings = [];
        const errors = [];
        // Dry-run: collect tests only, don't run them
        const result = await runner.run('pytest --collect-only -q', {
            cwd: projectRoot,
            saveLog: false,
            stageName: 'pytest-discovery',
        });
        if (!result.blocked && result.exitCode === 0) {
            const lines = result.stdout.split('\n').filter(Boolean);
            const testCount = lines.filter((l) => l.includes('::') || l.includes('test_')).length;
            if (testCount === 0) {
                findings.push(createFinding({
                    id: 'python-no-tests',
                    title: 'No pytest tests discovered',
                    explanation: `pytest --collect-only found 0 tests. The project has no test coverage via pytest.`,
                    severity: 'medium',
                    category: 'test',
                    fixable: 'manual',
                    confidence: confidence(80),
                    tags: ['python', 'tests', 'pytest', 'coverage'],
                    evidence: [
                        createEvidence('command-log', {
                            label: 'pytest --collect-only',
                            excerpt: `found 0 tests`,
                            timestamp: new Date().toISOString(),
                        }),
                    ],
                    suggestedFix: `Add pytest tests for critical bot/worker logic. At minimum, test message handlers, retry logic, and error paths.`,
                }));
            }
        }
        return { findings, errors };
    }
    async runRuffChecks(runner, projectRoot, pythonFiles) {
        const findings = [];
        const errors = [];
        const targets = pythonFiles.slice(0, 20);
        const result = await runner.run(`ruff check --output-format=json ${targets.join(' ')}`, {
            cwd: projectRoot,
            saveLog: false,
            stageName: 'ruff-check',
        });
        if (!result.blocked && result.exitCode !== 0) {
            try {
                const issues = JSON.parse(result.stdout || result.stderr || '[]');
                const byFile = new Map();
                for (const issue of issues.slice(0, 20)) {
                    const list = byFile.get(issue.filename) ?? [];
                    list.push(issue);
                    byFile.set(issue.filename, list);
                }
                for (const [file, fileIssues] of byFile) {
                    findings.push(createFinding({
                        id: `ruff-issues-${file.replace(/[^a-z0-9]/gi, '-')}`.substring(0, 60),
                        title: `Ruff lint issues in ${relative(projectRoot, file)}: ${fileIssues.length} problem(s)`,
                        explanation: `ruff check found ${fileIssues.length} lint issues in "${file}". These may cause runtime issues or indicate code quality problems.`,
                        severity: 'medium',
                        category: 'lint',
                        file,
                        fixable: 'auto',
                        confidence: confidence(85),
                        tags: ['python', 'lint', 'ruff'],
                        evidence: [
                            createEvidence('metric', { value: fileIssues.length, unit: 'issues', label: 'ruff-issue-count' }),
                            createEvidence('text', {
                                label: 'sample',
                                excerpt: fileIssues.slice(0, 3).map(i => `[${i.code}] ${i.message}`).join('; '),
                            }),
                        ],
                        suggestedFix: `Run \`ruff check ${file}\` to see all issues. Most can be auto-fixed with \`ruff check --fix ${file}\`.`,
                    }));
                }
            }
            catch {
                // Not JSON output — show raw
                if (result.stdout)
                    errors.push(`ruff: ${result.stdout.slice(0, 200)}`);
            }
        }
        return { findings, errors };
    }
    async runMypyChecks(runner, projectRoot, pythonFiles) {
        const findings = [];
        const errors = [];
        const targets = pythonFiles.slice(0, 10);
        const result = await runner.run(`mypy --no-error-summary --pretty ${targets.join(' ')}`, {
            cwd: projectRoot,
            saveLog: false,
            stageName: 'mypy-check',
        });
        if (!result.blocked && result.exitCode !== 0) {
            const lines = (result.stdout || result.stderr || '').split('\n').filter(Boolean).slice(0, 20);
            if (lines.length > 0) {
                findings.push(createFinding({
                    id: 'mypy-type-errors',
                    title: `mypy found type errors in ${pythonFiles.length} file(s)`,
                    explanation: `mypy type checking failed with ${lines.length} error line(s). Type errors can cause runtime TypeErrors in production.`,
                    severity: 'medium',
                    category: 'typecheck',
                    fixable: 'manual',
                    confidence: confidence(80),
                    tags: ['python', 'typecheck', 'mypy'],
                    evidence: [
                        createEvidence('command-log', {
                            label: 'mypy output',
                            excerpt: lines.slice(0, 5).join(' | '),
                            timestamp: new Date().toISOString(),
                        }),
                    ],
                    suggestedFix: `Run \`mypy ${targets.join(' ')}\` to see full output. Add type annotations to fix the reported errors.`,
                }));
                errors.push(`mypy: ${lines.slice(0, 5).join('; ')}`);
            }
        }
        return { findings, errors };
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Static pattern analysis
    // ─────────────────────────────────────────────────────────────────────────
    async analyzePatterns(projectRoot, pythonFiles) {
        const findings = [];
        for (const file of pythonFiles) {
            try {
                const content = await readFile(file, 'utf-8');
                const relPath = relative(projectRoot, file);
                const lines = content.split('\n');
                // 1. Hardcoded tokens / secrets
                const secretFindings = this.detectSecrets(relPath, content, file);
                findings.push(...secretFindings);
                // 2. Infinite loop without shutdown handling
                const loopFindings = this.detectInfiniteLoops(relPath, content, file);
                findings.push(...loopFindings);
                // 3. Unsafe eval/exec
                const unsafeFindings = this.detectUnsafeOperations(relPath, content, file);
                findings.push(...unsafeFindings);
                // 4. Broad except pass
                const exceptFindings = this.detectBareExceptPass(relPath, content, file);
                findings.push(...exceptFindings);
                // 5. Blocking ops in async code
                const asyncFindings = this.detectBlockingInAsync(relPath, content, file);
                findings.push(...asyncFindings);
                // 6. Missing error handling
                const errorFindings = this.detectMissingErrorHandling(relPath, content, file, lines);
                findings.push(...errorFindings);
                // 7. Missing retry/backoff
                const retryFindings = this.detectMissingRetry(relPath, content, file);
                findings.push(...retryFindings);
                // 8. Webhook/polling ambiguity
                const webhookFindings = this.detectWebhookPollingAmbiguity(relPath, content, file);
                findings.push(...webhookFindings);
            }
            catch {
                // skip unreadable files
            }
        }
        return findings;
    }
    detectSecrets(relPath, content, file) {
        const findings = [];
        // Patterns that work on Python variable assignment syntax
        // (no word boundary needed for variable names ending in TOKEN/KEY/SECRET)
        const secretPatterns = [
            { re: /["']TG_BOT_TOKEN["']\s*[:=]\s*["'][A-Za-z0-9_-]{30,}["']/g, label: 'TG_BOT_TOKEN' },
            { re: /["']BOT_TOKEN["']\s*[:=]\s*["'][A-Za-z0-9_-]{30,}["']/g, label: 'BOT_TOKEN' },
            { re: /["']API_KEY["']\s*[:=]\s*["'][A-Za-z0-9_-]{20,}["']/g, label: 'API_KEY' },
            { re: /["']OPENAI_API_KEY["']\s*[:=]\s*["']sk-[A-Za-z0-9]{20,}["']/g, label: 'OPENAI_API_KEY' },
            // Match Python var names ending in TOKEN/KEY/SECRET: BOT_TOKEN =, API_KEY =, etc.
            { re: /[A-Z_]*(?:TOKEN|KEY|SECRET|PASSWORD)\s*=\s*["'][A-Za-z0-9_-]{20,}["']/g, label: 'hardcoded-secret-var' },
            // Broad sk- pattern for any sk- prefixed secret value
            { re: /sk-[A-Za-z0-9]{20,}/g, label: 'openai-sk' },
            { re: /ghp_[A-Za-z0-9]{36,}/g, label: 'github-pat' },
        ];
        for (const { re, label } of secretPatterns) {
            re.lastIndex = 0;
            if (re.test(content)) {
                findings.push(createFinding({
                    id: `python-hardcoded-secret-${relPath.replace(/[^a-z0-9]/gi, '-')}`,
                    title: `Hardcoded secret detected in ${relPath}: ${label}`,
                    explanation: `A hardcoded secret pattern (${label}) was found in "${relPath}". Secrets in source code will be committed to version control and exposed in logs/artifacts.`,
                    severity: 'critical',
                    category: 'security',
                    file,
                    fixable: 'manual',
                    confidence: confidence(85),
                    tags: ['python', 'security', 'secret', 'hardcoded'],
                    evidence: [
                        createEvidence('text', {
                            label: 'secret-pattern',
                            excerpt: `Found ${label} pattern in ${relPath}`,
                        }),
                    ],
                    suggestedFix: `Move secrets to environment variables (os.environ["${label}"]) or a .env file loaded at startup. Never commit secrets to source control.`,
                }));
            }
        }
        return findings;
    }
    detectInfiniteLoops(relPath, content, file) {
        const findings = [];
        // Detect: while True: without break or shutdown signal handling
        const whileTrueRe = /while\s+True\s*:/g;
        let match;
        while ((match = whileTrueRe.exec(content)) !== null) {
            const lineNum = content.slice(0, match.index).split('\n').length;
            const line = content.split('\n')[lineNum - 1];
            // Look for break, shutdown event, or signal handler within 50 lines after
            const afterBlock = content.slice(match.index, match.index + 3000);
            const hasBreak = /break/.test(afterBlock.slice(0, 500));
            const hasShutdown = /shutdown|stop_event|stop_event|graceful_exit|SIGTERM|SIGINT/.test(afterBlock.slice(0, 1000));
            const hasTryExcept = /try:/.test(afterBlock.slice(0, 500));
            if (!hasBreak && !hasShutdown) {
                findings.push(createFinding({
                    id: `python-infinite-loop-${relPath.replace(/[^a-z0-9]/gi, '-')}-L${lineNum}`,
                    title: `Potential infinite loop without graceful shutdown in ${relPath}:${lineNum}`,
                    explanation: `Found \`while True:\` loop with no break statement or shutdown signal handling in "${relPath}" line ${lineNum}. This prevents graceful shutdown and makes the process impossible to restart cleanly.`,
                    severity: 'medium',
                    category: 'runtime',
                    file,
                    line: lineNum,
                    fixable: 'manual',
                    confidence: confidence(75),
                    tags: ['python', 'infinite-loop', 'shutdown', 'reliability'],
                    evidence: [
                        createEvidence('text', { label: 'loop-line', excerpt: line.trim() }),
                        createEvidence('text', { label: 'has-break', excerpt: String(hasBreak) }),
                        createEvidence('text', { label: 'has-shutdown-handler', excerpt: String(hasShutdown) }),
                    ],
                    suggestedFix: `Add a shutdown event (asyncio.Event or threading.Event) that the loop checks on each iteration: \`while not shutdown_event.is_set():\`. Handle SIGTERM/SIGINT signals.`,
                }));
            }
        }
        return findings;
    }
    detectUnsafeOperations(relPath, content, file) {
        const findings = [];
        const unsafeOps = [
            { re: /\beval\s*\(/g, label: 'eval()' },
            { re: /\bexec\s*\(/g, label: 'exec()' },
            { re: /\bexec\s*\(\s*["']/g, label: 'exec with string' },
            { re: /__import__\s*\(/g, label: '__import__()' },
            { re: /import\s+os\s*;?\s*system\s*\(/g, label: 'os.system()' },
            { re: /subprocess\.call\s*\(\s*["']/g, label: 'subprocess.call with shell string' },
        ];
        for (const { re, label } of unsafeOps) {
            re.lastIndex = 0;
            if (re.test(content)) {
                const lineNum = content.slice(0, re.lastIndex).split('\n').length;
                findings.push(createFinding({
                    id: `python-unsafe-op-${relPath.replace(/[^a-z0-9]/gi, '-')}-${label.replace(/[^a-z]/gi, '')}`,
                    title: `Unsafe operation in ${relPath}: ${label}`,
                    explanation: `The "${label}" call in "${relPath}" can lead to code injection attacks if any input is user-controlled. This is a critical security risk.`,
                    severity: 'critical',
                    category: 'security',
                    file,
                    line: lineNum,
                    fixable: 'manual',
                    confidence: confidence(90),
                    tags: ['python', 'security', 'code-injection', 'unsafe'],
                    evidence: [
                        createEvidence('text', { label: 'unsafe-pattern', excerpt: label }),
                    ],
                    suggestedFix: `Replace ${label} with safer alternatives (ast.literal_eval for data, subprocess.run with list args, never shell=True).`,
                }));
            }
        }
        return findings;
    }
    detectBareExceptPass(relPath, content, file) {
        const findings = [];
        // Detect bare except: except: pass with no logging
        // Handles both same-line (except: pass) and multi-line (except:\n        pass)
        // \s after colon: only horizontal whitespace; pass must be on same line
        // OR a new line (any content) followed by a line starting with pass
        const bareExceptRe = /except\s*:\s*(?:pass\b|#.*$|[\r\n]+[ \t]*pass\b)/gm;
        let match;
        while ((match = bareExceptRe.exec(content)) !== null) {
            const lineNum = content.slice(0, match.index).split('\n').length;
            const beforeExcept = content.slice(Math.max(0, match.index - 200), match.index);
            const hasLogging = /logger\.|logging\.|print\s*\(/.test(beforeExcept);
            if (!hasLogging) {
                findings.push(createFinding({
                    id: `python-bare-except-${relPath.replace(/[^a-z0-9]/gi, '-')}-L${lineNum}`,
                    title: `Bare except with pass (no logging) in ${relPath}:${lineNum}`,
                    explanation: `A bare \`except: pass\` swallows all exceptions silently in "${relPath}" line ${lineNum}. This makes debugging impossible and can hide runtime failures.`,
                    severity: 'medium',
                    category: 'maintainability',
                    file,
                    line: lineNum,
                    fixable: 'manual',
                    confidence: confidence(80),
                    tags: ['python', 'exception', 'silent-failure', 'maintainability'],
                    evidence: [
                        createEvidence('text', {
                            label: 'except-pass',
                            excerpt: content.split('\n')[lineNum - 1].trim(),
                        }),
                    ],
                    suggestedFix: `Replace bare \`except:\` with specific exception types and add logging: \`except ValueError as e: logger.error("...%s", e)\`.`,
                }));
            }
        }
        return findings;
    }
    detectBlockingInAsync(relPath, content, file) {
        const findings = [];
        // Detect if file has async def and uses blocking calls inside
        if (!/async\s+def/.test(content))
            return findings;
        const blockingCalls = [
            { re: /\btime\.sleep\s*\(/g, label: 'time.sleep()' },
            { re: /\brequests\.(get|post|put|delete|patch)\s*\(/g, label: 'requests.* (sync HTTP)' },
            { re: /\bopen\s*\(/g, label: 'open() (sync file I/O)' },
            { re: /os\.system\s*\(/g, label: 'os.system()' },
        ];
        for (const { re, label } of blockingCalls) {
            re.lastIndex = 0;
            if (re.test(content)) {
                const lineNum = content.slice(0, re.lastIndex).split('\n').length;
                findings.push(createFinding({
                    id: `python-async-blocking-${relPath.replace(/[^a-z0-9]/gi, '-')}-${label.replace(/[^a-z]/gi, '')}`,
                    title: `Blocking call inside async function in ${relPath}:${lineNum}`,
                    explanation: `"${label}" is a blocking call found in an async context in "${relPath}". This blocks the entire event loop, defeating the purpose of async. Use \`asyncio.sleep()\`, \`aiohttp\`, or \`asyncio.to_thread()\` instead.`,
                    severity: 'medium',
                    category: 'runtime',
                    file,
                    line: lineNum,
                    fixable: 'manual',
                    confidence: confidence(75),
                    tags: ['python', 'async', 'blocking', 'performance'],
                    evidence: [
                        createEvidence('text', { label: 'blocking-call', excerpt: label }),
                    ],
                    suggestedFix: `Replace blocking calls: time.sleep → asyncio.sleep; requests.* → aiohttp; open() → aiofiles; os.system → asyncio.create_subprocess_exec.`,
                }));
            }
        }
        return findings;
    }
    detectMissingErrorHandling(relPath, content, file, lines) {
        const findings = [];
        // Detect functions with no try/except and no return type annotation for external calls
        // Check for API call patterns without error handling nearby
        const apiPatterns = [
            /requests\.(get|post|put|delete|patch)\s*\(/,
            /httpx\.(get|post|put|delete|patch)\s*\(/,
            /aiohttp\.(get|post|put|delete|patch)\s*\(/,
        ];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const hasApiCall = apiPatterns.some(p => p.test(line));
            if (!hasApiCall)
                continue;
            // Check if there's a try block around this line (within 3 lines before)
            const windowBefore = lines.slice(Math.max(0, i - 5), i).join('\n');
            const hasTryBefore = /try\s*:/.test(windowBefore);
            const hasExceptAfter = lines.slice(i, Math.min(lines.length, i + 5)).join('\n').includes('except');
            if (!hasTryBefore && !hasExceptAfter) {
                findings.push(createFinding({
                    id: `python-unhandled-api-${relPath.replace(/[^a-z0-9]/gi, '-')}-L${i + 1}`,
                    title: `API call without error handling in ${relPath}:${i + 1}`,
                    explanation: `An HTTP API call in "${relPath}" line ${i + 1} has no surrounding try/except. Network requests fail regularly — this will propagate as an unhandled exception.`,
                    severity: 'medium',
                    category: 'runtime',
                    file,
                    line: i + 1,
                    fixable: 'manual',
                    confidence: confidence(70),
                    tags: ['python', 'error-handling', 'api', 'reliability'],
                    evidence: [
                        createEvidence('text', { label: 'api-line', excerpt: line.trim() }),
                    ],
                    suggestedFix: `Wrap API calls in try/except with retry logic: \`for attempt in range(3): try: ... except requests.RequestException: ...\`.`,
                }));
            }
        }
        return findings;
    }
    detectMissingRetry(relPath, content, file) {
        const findings = [];
        // Detect network calls without retry logic
        const networkPatterns = [
            /requests\.(get|post|put|delete|patch)\s*\(/,
            /httpx\.(get|post|put|delete|patch)\s*\(/,
            /telegram\.Bot\(\)\.send_/,
            /bot\.send_message/,
        ];
        const hasRetryImport = /tenacity|tenacity\.|retry|backoff|from tenacity import/i.test(content);
        const hasRetryLogic = /@retry|for.*in.*range.*3|max_retries|MAX_RETRIES/i.test(content);
        if (networkPatterns.some(p => p.test(content)) && !hasRetryImport && !hasRetryLogic) {
            findings.push(createFinding({
                id: `python-missing-retry-${relPath.replace(/[^a-z0-9]/gi, '-')}`,
                title: `Network call without retry logic in ${relPath}`,
                explanation: `"${relPath}" makes network calls (API/Bot) without retry/backoff logic. Network requests fail transiently — the first failure will abort the operation.`,
                severity: 'medium',
                category: 'runtime',
                file,
                fixable: 'manual',
                confidence: confidence(70),
                tags: ['python', 'retry', 'network', 'reliability'],
                evidence: [
                    createEvidence('text', {
                        label: 'no-retry',
                        excerpt: 'No retry/backoff library or manual retry loop found',
                    }),
                ],
                suggestedFix: `Add retry logic using tenacity (\`from tenacity import retry, stop_after_attempt\`), exponential backoff, or a simple manual retry loop for network operations.`,
            }));
        }
        return findings;
    }
    detectWebhookPollingAmbiguity(relPath, content, file) {
        const findings = [];
        const hasPolling = /dispatcher\.start_polling|dp\.start_polling|\.updater\.start_polling|bot\.polling|Updater\(.*poll=True|\.start_polling\(\)/i.test(content);
        const hasWebhook = /set_webhook|webhook_url|\.set_webhook\(/i.test(content);
        if (hasPolling && hasWebhook) {
            findings.push(createFinding({
                id: `python-webhook-polling-ambiguity-${relPath.replace(/[^a-z0-9]/gi, '-')}`,
                title: `Webhook and polling both detected in ${relPath} — mutually exclusive`,
                explanation: `Both polling and webhook configuration found in "${relPath}". These are mutually exclusive runtime modes. Using both simultaneously will cause unexpected behavior or duplicate message processing.`,
                severity: 'high',
                category: 'runtime',
                file,
                fixable: 'manual',
                confidence: confidence(85),
                tags: ['python', 'telegram', 'webhook', 'polling', 'ambiguity'],
                evidence: [
                    createEvidence('text', { label: 'has-polling', excerpt: String(hasPolling) }),
                    createEvidence('text', { label: 'has-webhook', excerpt: String(hasWebhook) }),
                ],
                suggestedFix: `Choose one delivery mode: either polling (start_polling) OR webhook (set_webhook + webhook server). Remove the unused configuration.`,
            }));
        }
        return findings;
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Entrypoint-specific checks
    // ─────────────────────────────────────────────────────────────────────────
    async checkEntrypoints(projectRoot, entrypoints) {
        const findings = [];
        for (const ep of entrypoints) {
            const fullPath = join(projectRoot, ep);
            try {
                const content = await readFile(fullPath, 'utf-8');
                // Check if main entrypoint has if __name__ == "__main__": guard
                if (ep === 'main.py' || ep === 'bot.py' || ep === 'run.py') {
                    if (!/if\s+__name__\s*==\s*["']__main__["']\s*:/m.test(content)) {
                        findings.push(createFinding({
                            id: `python-no-name-main-${ep.replace(/[^a-z0-9]/gi, '-')}`,
                            title: `Entrypoint ${ep} missing \`if __name__ == "__main__":\` guard`,
                            explanation: `"${ep}" does not have a \`if __name__ == "__main__":\` guard. Running it as a script will execute top-level code that may have side effects (starting the bot, sending messages, etc.).`,
                            severity: 'low',
                            category: 'runtime',
                            file: fullPath,
                            fixable: 'manual',
                            confidence: confidence(70),
                            tags: ['python', 'entrypoint', 'best-practice'],
                            evidence: [
                                createEvidence('text', { label: 'entrypoint', excerpt: ep }),
                            ],
                            suggestedFix: `Wrap the bot startup code in \`if __name__ == "__main__":\` to prevent accidental execution on import.`,
                        }));
                    }
                }
                // Check bot registration
                const hasHandlerRegistration = /dp\.add_handler|dispatcher\.add_handler|bot\.add_handler/i.test(content);
                const hasBotInit = /telegram\.Bot\(|Bot\(/.test(content);
                if (hasBotInit && !hasHandlerRegistration) {
                    findings.push(createFinding({
                        id: `python-bot-no-handlers-${ep.replace(/[^a-z0-9]/gi, '-')}`,
                        title: `Bot initialized without registered handlers in ${ep}`,
                        explanation: `"${ep}" creates a Telegram bot instance but no handlers are registered (dp.add_handler / bot.add_handler not found). The bot will start but won't respond to any messages.`,
                        severity: 'high',
                        category: 'runtime',
                        file: fullPath,
                        fixable: 'manual',
                        confidence: confidence(80),
                        tags: ['python', 'telegram-bot', 'handler', 'runtime'],
                        evidence: [
                            createEvidence('text', { label: 'has-bot-init', excerpt: 'Bot() found' }),
                            createEvidence('text', { label: 'has-handlers', excerpt: String(hasHandlerRegistration) }),
                        ],
                        suggestedFix: `Register at least one handler: \`dp.add_handler(MessageHandler(filters.TEXT, handle_message))\` or equivalent for your bot framework.`,
                    }));
                }
            }
            catch {
                // skip unreadable
            }
        }
        return findings;
    }
}
//# sourceMappingURL=PythonRuntimeAnalyzer.js.map