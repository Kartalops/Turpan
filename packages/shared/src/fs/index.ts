import { dirname, join, resolve, isAbsolute } from 'path';
import { existsSync, readFileSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'fs';

export function resolveProjectPath(input?: string): string {
  if (!input) {
    return process.cwd();
  }
  return isAbsolute(input) ? input : resolve(process.cwd(), input);
}

export function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

export function fileExists(filePath: string): boolean {
  return existsSync(filePath);
}

export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function listDirectory(path: string): string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

export function readJsonFile<T>(filePath: string): T | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export function writeJsonFile(filePath: string, data: unknown): void {
  ensureDir(dirname(filePath));
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export function getPackageJsonInfo(dirPath: string): { name?: string; version?: string } | null {
  const pkgPath = join(dirPath, 'package.json');
  return readJsonFile<{ name?: string; version?: string }>(pkgPath);
}

export function createTimestampDir(basePath: string): string {
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
