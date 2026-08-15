import type { Evidence } from '../protocol/index.js';
import type { RuntimeCorrelation } from './types.js';
export declare class RuntimeCorrelator {
    correlate(runtimeEvidence: Evidence, sourceFiles: Array<{
        path: string;
        content: string;
    }>): RuntimeCorrelation;
}
//# sourceMappingURL=RuntimeCorrelation.d.ts.map