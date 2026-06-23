/**
 * Evidence — structured proof for a Finding
 * Every Finding must be backed by concrete evidence, never vague assertion
 */
export type EvidenceType = 'command-log' | 'code' | 'screenshot' | 'trace' | 'network' | 'console' | 'file' | 'diff' | 'metric' | 'text';
export interface Evidence {
    type: EvidenceType;
    /** Human-readable label for this evidence */
    label?: string;
    /** Absolute path to file (when type is 'file', 'code', 'diff', 'screenshot') */
    path?: string;
    /** Code/screenshot excerpt or console output */
    excerpt?: string;
    /** URL for screenshot, network trace, or external reference */
    url?: string;
    /** Unix timestamp when evidence was collected */
    timestamp?: string;
    /** Command that produced this evidence (for command-log type) */
    command?: string;
    /** Exit code of the command */
    exitCode?: number;
    /** Numeric metric value */
    value?: number;
    /** Unit of the metric */
    unit?: string;
    /** Additional metadata */
    metadata?: Record<string, string | number | boolean>;
}
export declare function createEvidence(type: EvidenceType, partial?: Partial<Evidence>): Evidence;
export declare function createCommandEvidence(command: string, stdout: string, exitCode: number, partial?: Partial<Evidence>): Evidence;
export declare function createCodeEvidence(path: string, excerpt: string, partial?: Partial<Evidence>): Evidence;
export declare function createMetricEvidence(value: number, unit: string, label?: string, partial?: Partial<Evidence>): Evidence;
//# sourceMappingURL=Evidence.d.ts.map