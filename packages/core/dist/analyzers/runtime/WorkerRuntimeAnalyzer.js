/**
 * WorkerRuntimeAnalyzer — runtime safety review for worker/queue systems (Celery, RQ, BullMQ, etc.).
 *
 * Applies to: Python or Node projects with worker patterns (celery, rq, redis, bull, bullmq)
 *
 * Safety guarantees:
 * - Never runs destructive jobs.
 * - Never enqueues real work.
 * - Validates import/startup only.
 */
import { createFinding, confidence } from '../../findings/Finding.js';
import { createEvidence } from '../../findings/Evidence.js';
import { readFile } from 'fs/promises';
import { join, relative } from 'path';
import { walkFiles } from '../../shared/index.js';
export class WorkerRuntimeAnalyzer {
    id = 'worker-runtime';
    name = 'Worker/Queue Runtime Analyzer';
    categories = ['runtime', 'worker', 'queue'];
    supports(fp) {
        const deps = [
            'celery', 'rq', 'redis', 'bull', 'bullmq',
            'honeycomb', 'sqs', 'sns', 'beanstalkd',
        ];
        const allDeps = [
            ...Object.keys(fp).filter(k => k.toLowerCase().includes('depend')),
        ];
        return (fp.languages.some(language => ['python', 'javascript', 'typescript'].includes(language.toLowerCase())));
    }
    async run(ctx) {
        const errors = [];
        const findings = [];
        // 1. Detect worker patterns
        const workerInfo = await this.detectWorkerPattern(ctx.projectRoot);
        if (!workerInfo.detected) {
            return { analyzerId: this.id, findings: [], durationMs: 0, errors: [] };
        }
        // 2. Check for missing retry/DLQ
        const retryFindings = await this.checkRetryAndDLQ(ctx.projectRoot, workerInfo);
        findings.push(...retryFindings);
        // 3. Check for missing idempotency
        const idempotencyFindings = await this.checkIdempotency(ctx.projectRoot, workerInfo);
        findings.push(...idempotencyFindings);
        // 4. Check for graceful shutdown
        const shutdownFindings = await this.checkGracefulShutdown(ctx.projectRoot, workerInfo);
        findings.push(...shutdownFindings);
        // 5. Check for missing heartbeat/visibility timeout
        const heartbeatFindings = await this.checkHeartbeat(ctx.projectRoot, workerInfo);
        findings.push(...heartbeatFindings);
        return {
            analyzerId: this.id,
            findings,
            artifacts: workerInfo,
            durationMs: 0,
            errors,
        };
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Worker pattern detection
    // ─────────────────────────────────────────────────────────────────────────
    async detectWorkerPattern(projectRoot) {
        const result = {
            detected: false,
            framework: 'unknown',
            configFiles: [],
            taskFiles: [],
        };
        const pyFiles = await walkFiles({
            cwd: projectRoot,
            extensions: ['py'],
            ignoreDirs: new Set(['node_modules', '.git', '__pycache__', '.pytest_cache']),
        });
        const jsFiles = await walkFiles({
            cwd: projectRoot,
            extensions: ['js', 'ts'],
            ignoreDirs: new Set(['node_modules', '.git']),
        });
        // Python worker patterns
        const celeryIndicators = ['from celery import', 'app = Celery', '@celery.task', '@app.task'];
        const rqIndicators = ['from rq import', 'Queue(', '@job'];
        const workerFrameworks = [
            { name: 'celery', indicators: celeryIndicators },
            { name: 'rq', indicators: rqIndicators },
        ];
        for (const file of pyFiles) {
            try {
                const content = await readFile(file, 'utf-8');
                for (const fw of workerFrameworks) {
                    if (fw.indicators.some(ind => content.includes(ind))) {
                        result.detected = true;
                        result.framework = fw.name;
                        result.taskFiles.push(relative(projectRoot, file));
                    }
                }
                // Check for config files
                if (['celeryconfig.py', 'celery.py', 'tasks.py', 'workers.py'].some(n => file.endsWith(n))) {
                    result.configFiles.push(relative(projectRoot, file));
                }
            }
            catch {
                // skip
            }
        }
        // Node worker patterns
        const bullIndicators = ['from bullmq', 'from bull', 'new Bull(', 'new BullMQ('];
        for (const file of jsFiles) {
            try {
                const content = await readFile(file, 'utf-8');
                if (/new\s+(Bull|BullMQ)\s*\(/.test(content)) {
                    result.detected = true;
                    result.framework = 'bullmq';
                    result.taskFiles.push(relative(projectRoot, file));
                }
            }
            catch {
                // skip
            }
        }
        // Check package.json or pyproject.toml for worker dependencies
        try {
            const pkgPath = join(projectRoot, 'package.json');
            const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };
            if (deps['bull'] || deps['bullmq'] || deps['@taskr/core']) {
                result.detected = true;
                result.framework = deps['bullmq'] ? 'bullmq' : 'bull';
            }
        }
        catch {
            // not found
        }
        try {
            const pyprojectPath = join(projectRoot, 'pyproject.toml');
            const content = await readFile(pyprojectPath, 'utf-8');
            if (/celery|rq|redis-queue/i.test(content)) {
                result.detected = true;
                if (!result.configFiles.length)
                    result.framework = 'celery';
            }
        }
        catch {
            // not found
        }
        return result;
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Retry and DLQ checks
    // ─────────────────────────────────────────────────────────────────────────
    async checkRetryAndDLQ(projectRoot, workerInfo) {
        const findings = [];
        if (workerInfo.taskFiles.length === 0)
            return findings;
        const retryPatterns = {
            celery: [
                /autoretry_for\s*=\s*\[/,
                /retry_backoff\s*=\s*True/,
                /max_retries\s*=\s*[0-9]+/,
                /@task\(.*max_retries/i,
            ],
            rq: [
                /@job\(.*retry/i,
                /Queue\(.*retry|retry_after/i,
            ],
            bullmq: [
                /{.*retry.*:.*[0-9]/,
                /backoff/i,
            ],
        };
        const patterns = retryPatterns[workerInfo.framework] ?? [];
        for (const file of workerInfo.taskFiles) {
            const fullPath = join(projectRoot, file);
            try {
                const content = await readFile(fullPath, 'utf-8');
                const hasRetry = patterns.some(re => re.test(content));
                if (!hasRetry) {
                    findings.push(createFinding({
                        id: `worker-no-retry-${file.replace(/[^a-z0-9]/gi, '-')}`,
                        title: `Worker task without retry logic in ${file}`,
                        explanation: `The ${workerInfo.framework} task in "${file}" has no retry configuration. Transient failures (network timeout, DB deadlock) will result in permanent task failure without any recovery attempt.`,
                        severity: 'medium',
                        category: 'runtime',
                        file: fullPath,
                        fixable: 'manual',
                        confidence: confidence(75),
                        tags: ['worker', 'retry', 'reliability', 'queue'],
                        evidence: [
                            createEvidence('text', { label: 'framework', excerpt: workerInfo.framework }),
                        ],
                        suggestedFix: workerInfo.framework === 'celery'
                            ? `Add \`autoretry_for=(Exception,), retry_backoff=True, max_retries=3\` to the @task decorator.`
                            : workerInfo.framework === 'rq'
                                ? `Add \`@job(attempt=3, retry_on=Exception)\` or use rq's retry decorator.`
                                : `Configure retry in the BullMQ Queue options: \`new Queue({ defaultJobOptions: { retry: { attempts: 3 } } })\`.`,
                    }));
                }
                // Check for DLQ (dead letter queue) configuration
                const hasDLQ = /dead_letter|dLQ|dlq|on_failure|remove_on_fail/i.test(content);
                if (!hasDLQ) {
                    findings.push(createFinding({
                        id: `worker-no-dlq-${file.replace(/[^a-z0-9]/gi, '-')}`,
                        title: `Worker task without dead-letter queue in ${file}`,
                        explanation: `The ${workerInfo.framework} task in "${file}" has no dead-letter queue (DLQ) configuration. Failed tasks that exhaust retries will pile up in the main queue or be silently dropped.`,
                        severity: 'low',
                        category: 'runtime',
                        file: fullPath,
                        fixable: 'manual',
                        confidence: confidence(65),
                        tags: ['worker', 'dlq', 'dead-letter', 'reliability'],
                        evidence: [
                            createEvidence('text', { label: 'framework', excerpt: workerInfo.framework }),
                        ],
                        suggestedFix: `Configure a dead-letter queue: for Celery use \`Task.throws = ()\` + custom queue; for BullMQ use \`new Queue({ defaultJobOptions: { moveToFailedQueue: true } })\`.`,
                    }));
                }
            }
            catch {
                // skip
            }
        }
        return findings;
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Idempotency checks
    // ─────────────────────────────────────────────────────────────────────────
    async checkIdempotency(projectRoot, workerInfo) {
        const findings = [];
        for (const file of workerInfo.taskFiles) {
            const fullPath = join(projectRoot, file);
            try {
                const content = await readFile(fullPath, 'utf-8');
                // Look for idempotency patterns: checking if already processed, using unique keys
                const hasIdempotencyCheck = /if.*already.*processed|if.*exists|unique.*key|幂等/id.test(content) ||
                    /SELECT.*FOR UPDATE|LOCK|get_lock/i.test(content);
                if (!hasIdempotencyCheck) {
                    findings.push(createFinding({
                        id: `worker-no-idempotency-${file.replace(/[^a-z0-9]/gi, '-')}`,
                        title: `Worker task may not be idempotent: ${file}`,
                        explanation: `The ${workerInfo.framework} task in "${file}" shows no idempotency check. If the same message is delivered twice (common in queue systems), the operation will run twice, potentially causing duplicate charges, double writes, or other side effects.`,
                        severity: 'medium',
                        category: 'runtime',
                        file: fullPath,
                        fixable: 'manual',
                        confidence: confidence(70),
                        tags: ['worker', 'idempotency', 'queue', 'reliability'],
                        evidence: [
                            createEvidence('text', { label: 'framework', excerpt: workerInfo.framework }),
                        ],
                        suggestedFix: `Add idempotency: use the task's unique ID or a deterministic key to check if already processed: \`if await db.is_processed(task_id): return\`. Use SELECT FOR UPDATE in DB transactions.`,
                    }));
                }
            }
            catch {
                // skip
            }
        }
        return findings;
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Graceful shutdown checks
    // ─────────────────────────────────────────────────────────────────────────
    async checkGracefulShutdown(projectRoot, workerInfo) {
        const findings = [];
        const configFiles = workerInfo.configFiles.length > 0
            ? workerInfo.configFiles
            : workerInfo.taskFiles.slice(0, 3);
        for (const file of configFiles) {
            const fullPath = join(projectRoot, file);
            try {
                const content = await readFile(fullPath, 'utf-8');
                // Check for signal handling
                const hasSignalHandler = /signal\.signal|SIGTERM|SIGINT|signal\.SIGTERM/i.test(content);
                const hasGracefulShutdown = /shutdown|graceful|close.*connection|drain|flush.*log/i.test(content);
                if (!hasSignalHandler && !hasGracefulShutdown) {
                    findings.push(createFinding({
                        id: `worker-no-shutdown-${file.replace(/[^a-z0-9]/gi, '-')}`,
                        title: `Worker lacks graceful shutdown handling in ${file}`,
                        explanation: `The worker config/task file "${file}" has no SIGTERM/SIGINT handler or graceful shutdown logic. When Kubernetes/containers restart the pod, in-flight tasks will be killed without completion or acknowledgment, potentially causing data loss or duplicate processing.`,
                        severity: 'medium',
                        category: 'runtime',
                        file: fullPath,
                        fixable: 'manual',
                        confidence: confidence(75),
                        tags: ['worker', 'graceful-shutdown', 'kubernetes', 'reliability'],
                        evidence: [
                            createEvidence('text', { label: 'has-signal-handler', excerpt: String(hasSignalHandler) }),
                        ],
                        suggestedFix: `Add SIGTERM handler that waits for in-flight tasks to complete: \`signal.signal(signal.SIGTERM, lambda: event.set())\` and check the event in your task loop.`,
                    }));
                }
            }
            catch {
                // skip
            }
        }
        return findings;
    }
    // ─────────────────────────────────────────────────────────────────────────
    // Heartbeat/visibility timeout checks
    // ─────────────────────────────────────────────────────────────────────────
    async checkHeartbeat(projectRoot, workerInfo) {
        const findings = [];
        if (workerInfo.framework !== 'celery' && workerInfo.framework !== 'bullmq')
            return findings;
        for (const file of workerInfo.taskFiles) {
            const fullPath = join(projectRoot, file);
            try {
                const content = await readFile(fullPath, 'utf-8');
                // Celery: check for task_acks_late, task_reject_on_worker_lost
                if (workerInfo.framework === 'celery') {
                    const hasLateAck = /task_acks_late|task_ack_on_failure|task_reject_on_worker_lost/i.test(content);
                    if (!hasLateAck) {
                        findings.push(createFinding({
                            id: `worker-no-heartbeat-celery-${file.replace(/[^a-z0-9]/gi, '-')}`,
                            title: `Celery worker may not use task_acks_late in ${file}`,
                            explanation: `The Celery task in "${file}" does not configure \`task_acks_late\` or \`task_reject_on_worker_lost\`. If a worker crashes, tasks it has picked up but not completed will be re-queued immediately, causing duplicate processing.`,
                            severity: 'medium',
                            category: 'runtime',
                            file: fullPath,
                            fixable: 'manual',
                            confidence: confidence(75),
                            tags: ['worker', 'celery', 'heartbeat', 'visibility-timeout', 'reliability'],
                            evidence: [
                                createEvidence('text', { label: 'framework', excerpt: 'celery' }),
                            ],
                            suggestedFix: `Set \`task_acks_late=True\` and \`task_reject_on_worker_lost=True\` in your Celery configuration to ensure tasks are only acknowledged after completion.`,
                        }));
                    }
                }
                // BullMQ: check for removeOnComplete / visibility timeout
                if (workerInfo.framework === 'bullmq') {
                    const hasVisibilityConfig = /removeOnComplete|removeOnFail|lockDuration|visibilityTimeout/i.test(content);
                    if (!hasVisibilityConfig) {
                        findings.push(createFinding({
                            id: `worker-no-visibility-timeout-${file.replace(/[^a-z0-9]/gi, '-')}`,
                            title: `BullMQ worker may lack visibility timeout configuration in ${file}`,
                            explanation: `The BullMQ worker in "${file}" does not configure \`lockDuration\` (visibility timeout). If a worker crashes, tasks won't be re-queued until the lock expires (default 30s), causing unnecessary delays.`,
                            severity: 'low',
                            category: 'runtime',
                            file: fullPath,
                            fixable: 'manual',
                            confidence: confidence(65),
                            tags: ['worker', 'bullmq', 'visibility-timeout', 'reliability'],
                            evidence: [
                                createEvidence('text', { label: 'framework', excerpt: 'bullmq' }),
                            ],
                            suggestedFix: `Configure the worker's lockDuration: \`new Worker({ lockDuration: 30000 })\` matching your expected max task duration.`,
                        }));
                    }
                }
            }
            catch {
                // skip
            }
        }
        return findings;
    }
}
//# sourceMappingURL=WorkerRuntimeAnalyzer.js.map