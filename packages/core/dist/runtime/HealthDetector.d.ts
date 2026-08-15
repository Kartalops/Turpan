import type { HealthCheckResult } from './types.js';
export declare class HealthDetector {
    detect(input: {
        stdout?: string;
        port?: number;
        url?: string;
        processAlive?: boolean;
        timeoutMs?: number;
    }): Promise<HealthCheckResult>;
    private isPortOpen;
    private isHttpReady;
}
//# sourceMappingURL=HealthDetector.d.ts.map