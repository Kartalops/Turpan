import type { BootCandidate } from './types.js';
export declare class BootDiscovery {
    discover(projectRoot: string): BootCandidate[];
    private pushIfSafe;
    private detectPackageManager;
    private readJson;
    private readText;
}
//# sourceMappingURL=BootDiscovery.d.ts.map