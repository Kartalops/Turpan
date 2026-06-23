/**
 * TaskParser — parses the agent task/prompt and extracts expected capabilities
 */
import type { ParsedTask } from './types.js';
/**
 * Parse a task file and extract expected capabilities
 */
export declare function parseTaskText(text: string, source?: ParsedTask['source']): ParsedTask;
/**
 * Load task from a file path
 */
export declare function loadTaskFile(taskPath: string): ParsedTask;
/**
 * Load task from .turpan/task.md if it exists
 */
export declare function loadDefaultTask(projectRoot: string): ParsedTask | null;
//# sourceMappingURL=TaskParser.d.ts.map