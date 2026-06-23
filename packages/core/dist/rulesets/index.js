/**
 * Rulesets — built-in YAML rulesets for different project types.
 */
export const RULESETS = {
    /** Default ruleset — applies to all projects */
    default: 'default.yml',
    /** Frontend/UI focused ruleset */
    frontend: 'frontend.yml',
    /** Backend/API focused ruleset */
    backend: 'backend.yml',
    /** SaaS application ruleset */
    saas: 'saas.yml',
    /** Agent output audit ruleset */
    agentOutput: 'agent-output.yml',
    /** MCP server security ruleset */
    mcpSecurity: 'mcp-security.yml',
};
/**
 * Get the path to a ruleset file.
 */
export function getRulesetPath(id) {
    return RULESETS[id];
}
/**
 * List all available ruleset IDs.
 */
export function listRulesets() {
    return Object.keys(RULESETS);
}
//# sourceMappingURL=index.js.map