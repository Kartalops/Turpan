/**
 * Detect Scripts
 * Parses package.json scripts and categorizes them
 */

import { readJsonFile } from '@turpan/shared';

interface PackageJson {
  scripts?: Record<string, string>;
}

export interface ScriptsResult {
  buildCommands: string[];
  devCommands: string[];
  lintCommands: string[];
  typecheckCommands: string[];
  testCommands: string[];
  packageScripts: Record<string, string>;
}

export function detectScripts(projectRoot: string): ScriptsResult {
  const pkg = readJsonFile<PackageJson>(`${projectRoot}/package.json`);
  const scripts = pkg?.scripts || {};

  const result: ScriptsResult = {
    buildCommands: [],
    devCommands: [],
    lintCommands: [],
    typecheckCommands: [],
    testCommands: [],
    packageScripts: scripts,
  };

  for (const [name, command] of Object.entries(scripts)) {
    const lower = name.toLowerCase();

    // Build commands
    if (lower.includes('build')) {
      result.buildCommands.push(name);
    }

    // Dev commands
    if (lower === 'dev' || lower === 'develop' || lower === 'start' && lower.includes('dev')) {
      result.devCommands.push(name);
    }

    // TypeScript type checking
    if (lower.includes('typecheck') || lower.includes('type-check') || lower === 'tsc' || lower === 'types') {
      result.typecheckCommands.push(name);
    }

    // Linting
    if (lower.includes('lint') || lower === 'eslint' || lower === 'prettier' || lower.includes('format')) {
      result.lintCommands.push(name);
    }

    // Testing
    if (lower.includes('test') || lower.includes('spec') || lower.includes('jest') || lower.includes('vitest') || lower.includes('cypress')) {
      result.testCommands.push(name);
    }
  }

  // If no build script, that's important to report
  if (result.buildCommands.length === 0 && Object.keys(scripts).length > 0) {
    // The project might have build-like commands
    // Leave buildCommands empty to indicate missing
  }

  return result;
}

/**
 * Get a summary of available scripts
 */
export function getScriptsSummary(scripts: ScriptsResult): string {
  const parts: string[] = [];

  if (scripts.buildCommands.length > 0) {
    parts.push(`build: ${scripts.buildCommands.join(', ')}`);
  }

  if (scripts.devCommands.length > 0) {
    parts.push(`dev: ${scripts.devCommands.join(', ')}`);
  }

  if (scripts.testCommands.length > 0) {
    parts.push(`test: ${scripts.testCommands.join(', ')}`);
  }

  if (scripts.lintCommands.length > 0) {
    parts.push(`lint: ${scripts.lintCommands.join(', ')}`);
  }

  if (scripts.typecheckCommands.length > 0) {
    parts.push(`typecheck: ${scripts.typecheckCommands.join(', ')}`);
  }

  return parts.length > 0 ? parts.join(' | ') : 'No scripts detected';
}
