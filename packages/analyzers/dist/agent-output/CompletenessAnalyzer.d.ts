/**
 * CompletenessAnalyzer — orchestrates all agent-output analyzers and computes completion score
 */
import type { AgentOutputAuditReport } from './types.js';
export interface AgentAuditOptions {
    projectRoot: string;
    taskText?: string;
    taskFile?: string;
    useDefaultTask?: boolean;
    agentType?: string;
    /** When true, implementation mapping is scoped to changed files from a git diff */
    diffMode?: boolean;
    /** Git diff result — required when diffMode is true */
    diffResult?: {
        files: Array<{
            path: string;
            changeType: 'added' | 'modified' | 'deleted' | 'renamed';
            oldPath?: string;
        }>;
    };
}
export declare function runAgentOutputAudit(opts: AgentAuditOptions): Promise<AgentOutputAuditReport>;
export interface LLMJudgeConfig {
    provider: 'openai' | 'anthropic' | 'ollama';
    model?: string;
    apiKey?: string;
    baseUrl?: string;
}
export interface LLMJudge {
    judge(reports: AgentOutputAuditReport): Promise<AgentOutputAuditReport>;
}
//# sourceMappingURL=CompletenessAnalyzer.d.ts.map