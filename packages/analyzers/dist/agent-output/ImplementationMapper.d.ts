/**
 * ImplementationMapper — maps project files/routes/endpoints/components to expected capabilities
 */
import type { ParsedTask, ImplementationMap } from './types.js';
export interface MapImplementationOptions {
    diffMode?: boolean;
    diffResult?: {
        files: Array<{
            path: string;
            changeType: 'added' | 'modified' | 'deleted' | 'renamed';
            oldPath?: string;
        }>;
    };
}
/**
 * Map project files to capabilities based on the parsed task
 */
export declare function mapImplementation(projectRoot: string, task: ParsedTask, opts?: MapImplementationOptions): ImplementationMap;
/**
 * Get the list of API routes by scanning the project
 */
export declare function discoverApiRoutes(projectRoot: string): string[];
/**
 * Get the list of pages/routes by scanning the project
 */
export declare function discoverPages(projectRoot: string): string[];
//# sourceMappingURL=ImplementationMapper.d.ts.map