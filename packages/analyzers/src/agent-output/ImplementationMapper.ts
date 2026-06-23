/**
 * ImplementationMapper — maps project files/routes/endpoints/components to expected capabilities
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, extname, basename } from 'path';
import type { ParsedTask, CapabilityCategory, ImplementationMap, ImplementedItem } from './types.js';

// ── File Type Detection ───────────────────────────────────────────────────────

function isTextFile(filePath: string): boolean {
  const textExts = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.py', '.rb', '.go', '.rs', '.java', '.kt', '.cs',
    '.sh', '.bash', '.zsh',
    '.json', '.jsonc', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
    '.md', '.html', '.css', '.scss', '.sass', '.less',
    '.sql', '.graphql', '.gql',
    '.env', '.env.example', '.env.local',
    '.dockerfile', '.dockerignore',
    '.gitignore', '.editorconfig',
  ]);
  return textExts.has(extname(filePath).toLowerCase());
}

function walkDir(dir: string, maxDepth = 5, depth = 0): string[] {
  if (depth > maxDepth) return [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'build' || entry.name === '.next' || entry.name === '.turpan' || entry.name === 'coverage') continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...walkDir(fullPath, maxDepth, depth + 1));
      } else if (entry.isFile() && isTextFile(fullPath)) {
        files.push(fullPath);
      }
    }
    return files;
  } catch {
    return [];
  }
}

// ── Capability Mapper ────────────────────────────────────────────────────────

export interface MapImplementationOptions {
  diffMode?: boolean;
  diffResult?: {
    files: Array<{
      path: string;
      changeType: 'added' | 'modified' | 'deleted' | 'renamed';
      oldPath?: string;
    }>;
  };
}

/**
 * Map project files to capabilities based on the parsed task
 */
export function mapImplementation(
  projectRoot: string,
  task: ParsedTask,
  opts?: MapImplementationOptions
): ImplementationMap {
  const files = opts?.diffMode && opts?.diffResult
    ? opts.diffResult.files
        .filter(f => f.changeType !== 'deleted')
        .map(f => f.path)
        .map(p => join(projectRoot, p))
        .filter(p => {
          try { return require('fs').statSync(p).isFile(); } catch { return false; }
        })
    : walkDir(projectRoot);
  const items: ImplementedItem[] = [];
  const unmappedFiles: string[] = [];

  // Build capability map from task
  const capabilitySet = new Set(task.capabilities.map(c => c.category));

  for (const file of files) {
    const relPath = file.replace(projectRoot + '/', '');
    const impl = classifyFile(relPath, file, task);
    if (impl) {
      items.push(impl);
    } else {
      // Only include significant files as unmapped
      if (isSignificantFile(relPath)) {
        unmappedFiles.push(relPath);
      }
    }
  }

  return { items, unmappedFiles };
}

function isSignificantFile(relPath: string): boolean {
  const skipPatterns = [
    /node_modules/,
    /\.git\//,
    /dist\//,
    /build\//,
    /\.next\//,
    /coverage\//,
    /\.turpan\//,
    /\.cache\//,
    /\.vite\//,
    /\.eslintrc/,
    /\.prettierrc/,
    /tsconfig/,
    /\.DS_Store/,
    /package-lock\.json/,
    /pnpm-lock\.yaml/,
    /yarn\.lock/,
    /requirements\.txt$/,
    /go\.sum/,
    /\.env\.example/,
    /\.gitignore/,
    /\.dockerignore/,
    /LICENSE/,
    /CHANGELOG/,
    /\.md$/,
  ];
  return !skipPatterns.some(p => p.test(relPath));
}

function classifyFile(
  relPath: string,
  fullPath: string,
  task: ParsedTask
): ImplementedItem | null {
  const capabilitySet = new Set(task.capabilities.map(c => c.category));
  const fileName = basename(relPath);
  const ext = extname(relPath).toLowerCase();

  // Next.js / React / Solid routes
  if (/\/app\//.test(relPath) || /\/pages\//.test(relPath)) {
    const routeMatch = relPath.match(/\/(app|pages)\/([^/]+)/);
    const route = routeMatch ? `/${routeMatch[2]}` : undefined;

    if (/login|signin|auth/.test(fileName)) {
      return { file: relPath, type: 'route', capability: 'auth', detail: route };
    }
    if (/signup|register|join/.test(fileName)) {
      return { file: relPath, type: 'route', capability: 'auth', detail: route };
    }
    if (/dashboard|overview|home|index/.test(fileName)) {
      return { file: relPath, type: 'route', capability: 'dashboard', detail: route };
    }
    if (/settings?|config|preference/.test(fileName)) {
      return { file: relPath, type: 'route', capability: 'config', detail: route };
    }
    if (/pricing|billing|plan|subscription/.test(fileName)) {
      return { file: relPath, type: 'route', capability: 'billing', detail: route };
    }
    if (/api/.test(relPath)) {
      return { file: relPath, type: 'endpoint', capability: 'backend-endpoints', detail: route };
    }
    return { file: relPath, type: 'route', capability: 'ui-pages', detail: route };
  }

  // API routes
  if (/\/api\//.test(relPath) || /\/routes\//.test(relPath) || /\.route\.(ts|js)$/.test(fileName)) {
    const endpoint = extractEndpoint(relPath);
    // Determine specific capability from path keywords
    if (/billing|payment|stripe|checkout|subscription|invoice/i.test(relPath)) {
      return { file: relPath, type: 'endpoint', capability: 'billing', detail: endpoint };
    }
    if (/auth|login|jwt|logout|signup|register|password/i.test(relPath)) {
      return { file: relPath, type: 'endpoint', capability: 'auth', detail: endpoint };
    }
    if (/dashboard|analytics|metric|chart|widget/i.test(relPath)) {
      return { file: relPath, type: 'endpoint', capability: 'dashboard', detail: endpoint };
    }
    return { file: relPath, type: 'endpoint', capability: 'backend-endpoints', detail: endpoint };
  }

  // Components
  if (/(^|\/)components\//.test(relPath) || /(^|\/)ui\//.test(relPath) || /(^|\/)widgets\//.test(relPath)) {
    if (/button|input|form|card|modal|modal|dialog|dropdown|select|checkbox|radio/.test(fileName)) {
      return { file: relPath, type: 'component', capability: 'ui-pages' };
    }
    if (/dashboard|chart|graph|metric|stat|widget/.test(fileName)) {
      return { file: relPath, type: 'component', capability: 'dashboard' };
    }
    return { file: relPath, type: 'component' };
  }

  // Database / ORM
  if (/schema|model|migration|prisma|drizzle|\/db\//.test(relPath)) {
    if (ext === '.prisma' || ext === '.sql') {
      return { file: relPath, type: 'schema', capability: 'database' };
    }
    return { file: relPath, type: 'file', capability: 'database' };
  }

  // Auth
  if (/auth|jwt|session|token|password|oauth|permission|role|middleware/.test(relPath)) {
    return { file: relPath, type: 'file', capability: 'auth' };
  }

  // Billing / Payment
  if (/stripe|payment|billing|invoice|checkout|pricing|subscription|plan/.test(relPath)) {
    return { file: relPath, type: 'file', capability: 'billing' };
  }

  // Workers / Queue
  if (/worker|queue|job|cron|scheduler|background|dlq|retry/.test(relPath)) {
    return { file: relPath, type: 'file', capability: 'workers' };
  }

  // MCP Server
  if (/mcp|tool\s*provider|resource\s*provider|server\.ts/.test(relPath)) {
    if (ext === '.ts' || ext === '.js') {
      return { file: relPath, type: 'file', capability: 'mcp-server' };
    }
  }

  // CLI
  if (/bin|cli|command|commander|yargs/.test(relPath)) {
    if (ext === '.ts' || ext === '.js' || ext === '.sh') {
      return { file: relPath, type: 'script', capability: 'cli' };
    }
  }

  // Config
  if (/config|settings|\.env[^.]/.test(relPath) && !/example|template/.test(fileName)) {
    return { file: relPath, type: 'config', capability: 'config' };
  }

  // Integration
  if (/webhook|integration|third.?party|external|email|sendgrid|twilio|slack|discord/.test(relPath)) {
    return { file: relPath, type: 'file', capability: 'integrations' };
  }

  // Docs
  if (basename(relPath) === 'README.md' || /CHANGELOG|API.?docs|swagger|OpenAPI/.test(relPath)) {
    return { file: relPath, type: 'file', capability: 'docs' };
  }

  // Tests
  if (/\.(test|spec)\.(ts|js|tsx|jsx)|__tests?__|test\//.test(relPath)) {
    return { file: relPath, type: 'test', capability: 'tests' };
  }

  // Dockerfile / Deploy
  if (/docker|compose|vercel|netlify|deploy|CI\/CD|github.?action/.test(relPath)) {
    return { file: relPath, type: 'file', capability: 'deployment' };
  }

  return null;
}

function extractEndpoint(relPath: string): string {
  // Convert file path to endpoint pattern
  // app/api/users/route.ts -> /api/users
  // routes/auth.ts -> /auth
  const re = /(?:app\/api|api|routes)\/(.+?)(?:\/|.)route[./]|\/([a-zA-Z_-]+)\.ts$/;
  const match = re.exec(relPath);
  if (match) {
    const endpoint = '/' + ((match[1] || match[2]) ?? '').replace(/\//g, '/');
    return endpoint;
  }
  return relPath;
}

/**
 * Get the list of API routes by scanning the project
 */
export function discoverApiRoutes(projectRoot: string): string[] {
  const files = walkDir(projectRoot);
  const routes: string[] = [];
  for (const file of files) {
    const relPath = file.replace(projectRoot + '/', '');
    if (/\/api\//.test(relPath) || /\/routes\//.test(relPath) || /\.route\.(ts|js)$/.test(file)) {
      const endpoint = extractEndpoint(relPath);
      if (endpoint) routes.push(endpoint);
    }
  }
  return [...new Set(routes)];
}

/**
 * Get the list of pages/routes by scanning the project
 */
export function discoverPages(projectRoot: string): string[] {
  const files = walkDir(projectRoot);
  const pages: string[] = [];
  for (const file of files) {
    const relPath = file.replace(projectRoot + '/', '');
    if (/app\/[^/]+\//.test(relPath) && !/route\.(ts|js)$/.test(file)) {
      const match = relPath.match(/app\/([^/]+)/);
      if (match && match[1] !== 'api' && match[1] !== 'layout' && match[1] !== 'template') {
        pages.push('/' + match[1]);
      }
    }
    if (/pages\/[^_][^/]+\.tsx?$/.test(relPath)) {
      const match = relPath.match(/pages\/([^/]+)\.tsx?$/);
      if (match) {
        const page = '/' + match[1].replace(/\[([^\]]+)\]/g, ':$1');
        pages.push(page);
      }
    }
  }
  return [...new Set(pages)];
}
