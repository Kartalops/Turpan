import { resolve, join, isAbsolute } from 'path';
import { fileURLToPath } from 'url';
import { Dirent, existsSync, readFileSync, readdirSync, statSync, mkdirSync } from 'fs';

export function resolveProjectPath(input?: string): string {
  if (!input) {
    return process.cwd();
  }
  return isAbsolute(input) ? input : resolve(process.cwd(), input);
}

export function ensureDir(dirPath: string): void {
  // Placeholder - will use mkdir in real implementation
}

export function fileExists(filePath: string): boolean {
  return existsSync(filePath);
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
  // Placeholder - will use writeFile in real implementation
}

export function listDirectory(dirPath: string, recursive = false): string[] {
  try {
    const entries: string[] = [];
    const items = readdirSync(dirPath, { withFileTypes: true });

    for (const item of items) {
      const fullPath = join(dirPath, item.name);
      entries.push(fullPath);

      if (recursive && item.isDirectory()) {
        entries.push(...listDirectory(fullPath, true));
      }
    }

    return entries;
  } catch {
    return [];
  }
}

export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export function getPackageJsonInfo(dirPath: string): { name?: string; version?: string } | null {
  const pkgPath = join(dirPath, 'package.json');
  return readJsonFile<{ name?: string; version?: string }>(pkgPath);
}

export function getTurpanConfigPath(dirPath: string): string {
  return join(dirPath, 'turpan.yml');
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