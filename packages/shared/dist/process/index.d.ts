export interface ProcessResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}
export declare function runCommand(command: string, cwd?: string, timeout?: number): ProcessResult;
export declare function spawnCommand(command: string, args: string[], cwd?: string, onData?: (data: string) => void, onError?: (data: string) => void): Promise<number>;
export declare function getNodeVersion(): string;
export declare function getPlatform(): string;
export declare function getMemoryUsage(): {
    rss: number;
    heapUsed: number;
    heapTotal: number;
};
//# sourceMappingURL=index.d.ts.map