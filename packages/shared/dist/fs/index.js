import { dirname, join, resolve, isAbsolute } from 'path';
import { existsSync, readFileSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'fs';
export function resolveProjectPath(input) {
    if (!input) {
        return process.cwd();
    }
    return isAbsolute(input) ? input : resolve(process.cwd(), input);
}
export function ensureDir(dirPath) {
    if (!existsSync(dirPath)) {
        mkdirSync(dirPath, { recursive: true });
    }
}
export function fileExists(filePath) {
    return existsSync(filePath);
}
export function isDirectory(path) {
    try {
        return statSync(path).isDirectory();
    }
    catch {
        return false;
    }
}
export function listDirectory(path) {
    try {
        return readdirSync(path);
    }
    catch {
        return [];
    }
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
    ensureDir(dirname(filePath));
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}
export function getPackageJsonInfo(dirPath) {
    const pkgPath = join(dirPath, 'package.json');
    return readJsonFile(pkgPath);
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