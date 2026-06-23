/**
 * Rulesets — built-in YAML rulesets for different project types.
 */
export declare const RULESETS: {
    /** Default ruleset — applies to all projects */
    readonly default: "default.yml";
    /** Frontend/UI focused ruleset */
    readonly frontend: "frontend.yml";
    /** Backend/API focused ruleset */
    readonly backend: "backend.yml";
    /** SaaS application ruleset */
    readonly saas: "saas.yml";
    /** Agent output audit ruleset */
    readonly agentOutput: "agent-output.yml";
    /** MCP server security ruleset */
    readonly mcpSecurity: "mcp-security.yml";
};
export type RulesetId = keyof typeof RULESETS;
/**
 * Get the path to a ruleset file.
 */
export declare function getRulesetPath(id: RulesetId): string;
/**
 * List all available ruleset IDs.
 */
export declare function listRulesets(): RulesetId[];
//# sourceMappingURL=index.d.ts.map