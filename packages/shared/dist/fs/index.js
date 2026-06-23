import { resolve, join, isAbsolute } from 'path';
import { existsSync, readFileSync, readdirSync, statSync, mkdirSync } from 'fs';
export function resolveProjectPath(input) {
    if (!input) {
        return process.cwd();
    }
    return isAbsolute(input) ? input : resolve(process.cwd(), input);
}
export function ensureDir(dirPath) {
    // Placeholder - will use mkdir in real implementation
}
export function fileExists(filePath) {
    return existsSync(filePath);
}
export function readJsonFile(filePath) {
    try {
        const content = readFileSync(filePath, 'utf-8');
        return JSON.parse(content);
    }
    catch {
        return null;
    }
}
export function writeJsonFile(filePath, data) {
    // Placeholder - will use writeFile in real implementation
}
export function listDirectory(dirPath, recursive = false) {
    try {
        const entries = [];
        const items = readdirSync(dirPath, { withFileTypes: true });
        for (const item of items) {
            const fullPath = join(dirPath, item.name);
            entries.push(fullPath);
            if (recursive && item.isDirectory()) {
                entries.push(...listDirectory(fullPath, true));
            }
        }
        return entries;
    }
    catch {
        return [];
    }
}
export function isDirectory(path) {
    try {
        return statSync(path).isDirectory();
    }
    catch {
        return false;
    }
}
export function isFile(path) {
    try {
        return statSync(path).isFile();
    }
    catch {
        return false;
    }
}
export function getPackageJsonInfo(dirPath) {
    const pkgPath = join(dirPath, 'package.json');
    return readJsonFile(pkgPath);
}
export function getTurpanConfigPath(dirPath) {
    return join(dirPath, 'turpan.yml');
}
export function createTimestampDir(basePath) {
    if (!existsSync(basePath)) {
        mkdirSync(basePath, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dir = join(basePath, timestamp);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    return dir;
}
//# sourceMappingURL=index.js.map