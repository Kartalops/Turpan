export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export interface Logger {
    debug(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
}
export declare function createLogger(runPath: string, level?: LogLevel): Logger;
export declare function createNoopLogger(): Logger;
//# sourceMappingURL=index.d.ts.map