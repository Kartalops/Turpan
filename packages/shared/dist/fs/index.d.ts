export declare function resolveProjectPath(input?: string): string;
export declare function ensureDir(dirPath: string): void;
export declare function fileExists(filePath: string): boolean;
export declare function readJsonFile<T>(filePath: string): T | null;
export declare function writeJsonFile(filePath: string, data: unknown): void;
export declare function listDirectory(dirPath: string, recursive?: boolean): string[];
export declare function isDirectory(path: string): boolean;
export declare function isFile(path: string): boolean;
export declare function getPackageJsonInfo(dirPath: string): {
    name?: string;
    version?: string;
} | null;
export declare function getTurpanConfigPath(dirPath: string): string;
export declare function createTimestampDir(basePath: string): string;
//# sourceMappingURL=index.d.ts.map