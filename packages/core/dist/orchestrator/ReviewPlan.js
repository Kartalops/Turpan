/**
 * ReviewPlan — decides which stages to run based on ProjectFingerprint
 */
// All available stage definitions
const ALL_STAGES = [
    { id: 'project-fingerprint', label: 'Project Fingerprint', categories: ['project'] },
    { id: 'install-check', label: 'Install Check', categories: ['project', 'build'] },
    { id: 'script-detection', label: 'Script Detection', categories: ['project'] },
    { id: 'build', label: 'Build', categories: ['build'] },
    { id: 'test', label: 'Test', categories: ['test'] },
    { id: 'lint', label: 'Lint', categories: ['lint'] },
    { id: 'typecheck', label: 'Type Check', categories: ['typecheck'] },
    { id: 'static-quality', label: 'Static Quality', categories: ['maintainability', 'dead-code'] },
    { id: 'security-basic', label: 'Security (Basic)', categories: ['security'] },
    { id: 'dead-code-basic', label: 'Dead Code (Basic)', categories: ['dead-code'] },
    { id: 'ui-live-basic', label: 'UI Live (Basic)', categories: ['ui', 'accessibility'] },
    { id: 'report', label: 'Report Generation', categories: ['project'] },
];
/**
 * Generate a ReviewPlan from a ProjectFingerprint.
 * Stage selection is driven by project type — Next.js/Vite gets UI stages,
 * Python bots get Python-appropriate stages, generic projects get generic stages.
 */
export function generateReviewPlan(fingerprint, options = {}) {
    const { deepAnalysis = false, uiAnalysis = false } = options;
    const stages = [];
    let order = 0;
    const fp = fingerprint;
    // ── Always run these core stages ───────────────────────────────────────
    const always = ['project-fingerprint', 'install-check', 'script-detection'];
    for (const id of always) {
        const def = ALL_STAGES.find(s => s.id === id);
        stages.push({ id, label: def.label, reason: 'Core stage — always runs', order: order++ });
    }
    // ── Build stage (if build commands detected) ────────────────────────────
    if (fp.buildCommands.length > 0) {
        stages.push({ id: 'build', label: 'Build', reason: `Build commands detected: ${fp.buildCommands.join(', ')}`, order: order++ });
    }
    // ── Test stage ─────────────────────────────────────────────────────────
    if (fp.testCommands.length > 0) {
        stages.push({ id: 'test', label: 'Test', reason: `Test commands detected: ${fp.testCommands.join(', ')}`, order: order++ });
    }
    // ── Typecheck stage ────────────────────────────────────────────────────
    if (fp.typecheckCommands.length > 0) {
        stages.push({ id: 'typecheck', label: 'Type Check', reason: `Typecheck commands: ${fp.typecheckCommands.join(', ')}`, order: order++ });
    }
    // ── Lint stage ─────────────────────────────────────────────────────────
    if (fp.lintCommands.length > 0) {
        stages.push({ id: 'lint', label: 'Lint', reason: `Lint commands: ${fp.lintCommands.join(', ')}`, order: order++ });
    }
    // ── Static quality (deep only) ─────────────────────────────────────────
    if (deepAnalysis) {
        stages.push({ id: 'static-quality', label: 'Static Quality', reason: 'Deep analysis enabled', order: order++ });
    }
    // ── Security (deep only) ────────────────────────────────────────────────
    if (deepAnalysis) {
        stages.push({ id: 'security-basic', label: 'Security (Basic)', reason: 'Deep analysis enabled', order: order++ });
    }
    // ── Dead code (deep only) ───────────────────────────────────────────────
    if (deepAnalysis) {
        stages.push({ id: 'dead-code-basic', label: 'Dead Code (Basic)', reason: 'Deep analysis enabled', order: order++ });
    }
    // ── UI Live stage ───────────────────────────────────────────────────────
    // Only for projects with UI frameworks AND UI analysis explicitly enabled
    const hasUI = fp.uiFramework !== 'none' && fp.uiFramework !== 'unknown';
    if (hasUI && uiAnalysis) {
        stages.push({
            id: 'ui-live-basic',
            label: 'UI Live (Basic)',
            reason: `UI framework detected: ${fp.uiFramework}; UI analysis enabled`,
            order: order++,
        });
    }
    // ── Python-specific stages ──────────────────────────────────────────────
    // For Python bots, FastAPI, etc. — skip UI, add Python-appropriate stages
    const isPython = fp.languages.includes('python') || fp.appType === 'python-bot' || fp.appType === 'fastapi';
    if (isPython && !hasUI) {
        // Python backends: still run build/test/lint via shell commands if available
        if (deepAnalysis && !fp.buildCommands.length) {
            stages.push({ id: 'static-quality', label: 'Static Quality', reason: 'Python project deep analysis', order: order++ });
        }
    }
    // ── Final report ───────────────────────────────────────────────────────
    stages.push({ id: 'report', label: 'Report Generation', reason: 'Finalize and write reports', order: order++ });
    const estimatedTimes = {
        'project-fingerprint': '< 1s',
        'install-check': '5–30s',
        'script-detection': '< 1s',
        'build': '10–120s',
        'test': '10–300s',
        'lint': '5–60s',
        'typecheck': '5–60s',
        'static-quality': '10–60s',
        'security-basic': '5–30s',
        'dead-code-basic': '10–60s',
        'ui-live-basic': '30–180s',
        'report': '< 1s',
    };
    const totalEstimatedTime = stages
        .map(s => estimatedTimes[s.id] ?? '?')
        .join(' + ');
    return {
        runId: `plan-${Date.now().toString(36)}`,
        stages,
        totalEstimatedTime,
        includesUI: stages.some(s => s.id === 'ui-live-basic'),
        includesPython: fp.languages.includes('python') || fp.appType === 'fastapi' || fp.appType === 'python-bot',
        includesSecurity: stages.some(s => s.id === 'security-basic'),
        deepAnalysis,
    };
}
/** Print a human-readable plan summary */
export function formatPlanSummary(plan) {
    const lines = [];
    lines.push('## Review Plan');
    lines.push('');
    lines.push(`**Stages:** ${plan.stages.length}  |  **Estimated:** ${plan.totalEstimatedTime}`);
    lines.push(`**UI Stages:** ${plan.includesUI ? 'Yes' : 'No'}  |  **Python:** ${plan.includesPython ? 'Yes' : 'No'}  |  **Deep:** ${plan.deepAnalysis ? 'Yes' : 'No'}`);
    lines.push('');
    lines.push('| # | Stage | Reason |');
    lines.push('|---|-------|--------|');
    for (const s of plan.stages) {
        lines.push(`| ${s.order + 1} | ${s.label} | ${s.reason} |`);
    }
    return lines.join('\n');
}
//# sourceMappingURL=ReviewPlan.js.map