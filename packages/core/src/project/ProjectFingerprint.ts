/**
 * Project Fingerprint Types
 * Comprehensive project detection and metadata extraction
 */

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun' | 'unknown';

export type RuntimeType = 'node' | 'python' | 'deno' | 'bun' | 'unknown';

export type AppType =
  | 'nextjs'
  | 'vite-react'
  | 'node-backend'
  | 'python-bot'
  | 'fastapi'
  | 'telegram-bot'
  | 'chrome-extension'
  | 'mcp-server'
  | 'docker'
  | 'unknown';

export type UIFramework =
  | 'react'
  | 'vue'
  | 'svelte'
  | 'solid'
  | 'nextjs'
  | 'angular'
  | 'none'
  | 'unknown';

export type BackendFramework =
  | 'express'
  | 'fastify'
  | 'nestjs'
  | 'nextjs'
  | 'fastapi'
  | 'django'
  | 'flask'
  | 'none'
  | 'unknown';

export type TestTool =
  | 'vitest'
  | 'jest'
  | 'playwright'
  | 'cypress'
  | 'pytest'
  | 'none'
  | 'unknown';

export interface DatabaseHint {
  type: string;
  orm?: string;
  schemaFiles?: string[];
}

export interface AuthHint {
  type: string[];
  providers?: string[];
}

export interface DeploymentHint {
  platform?: string;
  dockerfile?: boolean;
  dockerCompose?: boolean;
  hasBuildScript?: boolean;
}

export interface RouteHint {
  type: 'pages' | 'app' | 'both';
  count: number;
  sampleRoutes?: string[];
}

export interface Entrypoint {
  name: string;
  path: string;
  type: 'cli' | 'server' | 'worker' | 'plugin' | 'unknown';
}

export interface EnvRequirement {
  name: string;
  description?: string;
  isSecret: boolean;
}

export interface ProjectFingerprint {
  // Basic info
  projectRoot: string;
  projectName: string;
  repositoryStatus: {
    isGitRepo: boolean;
    branch?: string;
    commitHash?: string;
    isDirty?: boolean;
  };

  // Package manager
  packageManager: PackageManager;
  lockFile?: string;

  // Languages & Runtimes
  languages: string[];
  runtimeType: RuntimeType;

  // Framework detection
  appType: AppType;
  uiFramework: UIFramework;
  backendFramework: BackendFramework;
  testTools: TestTool[];

  // Scripts from package.json
  buildCommands: string[];
  devCommands: string[];
  lintCommands: string[];
  typecheckCommands: string[];
  testCommands: string[];
  packageScripts: Record<string, string>;

  // Docker
  dockerAvailable: boolean;
  dockerComposeAvailable: boolean;

  // Environment
  envFiles: string[];
  envRequirements: EnvRequirement[];

  // Routes & Entrypoints
  routeHints: RouteHint[];
  entrypoints: Entrypoint[];

  // Database
  databaseHints: DatabaseHint[];

  // Auth
  authHints: AuthHint[];

  // Deployment
  deploymentHints: DeploymentHint;

  // Detected files
  detectedFiles: string[];
  missingFiles: string[];

  // Timestamp
  fingerprintedAt: string;
}

/**
 * Redacts secret-like values from strings
 * Used to prevent accidental secret exposure in logs/reports
 */
export function redactSecrets(value: string): string {
  // Common secret patterns
  const secretPatterns = [
    /(?<![A-Z0-9])(?:api[_-]?key|apikey|api_secret|apiSecret)[=:]["']?[\w-]{20,}["']?/gi,
    /(?<![A-Z0-9])(?:secret|password|passwd|pwd|token|auth[_-]?token|access[_-]?token)["']?[:=]?["']?[\w-]{20,}["']?/gi,
    /sk-[a-zA-Z0-9]{48,}/g,
    /ghp_[a-zA-Z0-9]{36,}/g,
    /[a-zA-Z0-9._-]+(?<![A-Z0-9])@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,}(?![A-Za-z0-9._-])/g, // emails
  ];

  let redacted = value;
  for (const pattern of secretPatterns) {
    redacted = redacted.replace(pattern, '[REDACTED]');
  }
  return redacted;
}

/**
 * Checks if a value looks like a secret
 */
export function looksLikeSecret(key: string, value: string): boolean {
  const secretKeys = [
    'api_key', 'apikey', 'apiKey', 'api_secret', 'secret', 'password', 'passwd',
    'pwd', 'token', 'auth_token', 'access_token', 'refresh_token', 'bearer',
    'private_key', 'privatekey', 'secret_key', 'aws_access_key', 'aws_secret',
    'stripe_key', 'stripe_secret', 'ghp_', 'sk_', 'pk_', 'key', 'credential',
  ];

  const keyLower = key.toLowerCase();
  return secretKeys.some(sk => keyLower.includes(sk.toLowerCase())) && value.length > 8;
}
