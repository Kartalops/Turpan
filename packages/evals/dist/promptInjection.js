const INJECTION_PATTERNS = [
    /ignore (all )?(previous|prior) instructions/i,
    /system prompt/i,
    /developer message/i,
    /reveal.*secret/i,
    /disregard.*policy/i,
    /you are now/i,
];
export function treatRepositoryTextAsData(source, label = 'repository-content') {
    const warnings = INJECTION_PATTERNS
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `possible prompt injection in ${label}: ${pattern.source}`);
    return {
        sanitized: [
            `<UNTRUSTED_DATA source="${escapeAttribute(label)}">`,
            source,
            '</UNTRUSTED_DATA>',
        ].join('\n'),
        warnings,
    };
}
function escapeAttribute(value) {
    return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
//# sourceMappingURL=promptInjection.js.map