/**
 * Evidence — structured proof for a Finding
 * Every Finding must be backed by concrete evidence, never vague assertion
 */
export function createEvidence(type, partial = {}) {
    return {
        type,
        timestamp: new Date().toISOString(),
        ...partial,
    };
}
export function createCommandEvidence(command, stdout, exitCode, partial = {}) {
    return createEvidence('command-log', {
        command,
        excerpt: stdout.length > 2000 ? stdout.slice(0, 2000) + '\n…[truncated]' : stdout,
        exitCode,
        ...partial,
    });
}
export function createCodeEvidence(path, excerpt, partial = {}) {
    return createEvidence('code', { path, excerpt, ...partial });
}
export function createMetricEvidence(value, unit, label, partial = {}) {
    return createEvidence('metric', { value, unit, label, ...partial });
}
//# sourceMappingURL=Evidence.js.map