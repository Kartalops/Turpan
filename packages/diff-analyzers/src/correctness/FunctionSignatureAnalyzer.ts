/**
 * FunctionSignatureAnalyzer — detect exported function signature changes without caller updates
 */

import type { DiffScopedAnalyzer, DiffScopedAnalyzerContext, DiffScopedFinding } from '../types.js';

const SKIP_PATHS = [
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt',
  '.output', '.cache', '__pycache__', 'vendor', 'vendored',
  'test', 'tests', '__tests__', '.test.', '.spec.', 'spec/', '__spec__',
];

function shouldSkipPath(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return SKIP_PATHS.some((skip) => lower.includes(skip));
}

function isTestFile(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.includes('.test.') ||
    lower.includes('.spec.') ||
    lower.includes('/test/') ||
    lower.includes('/tests/') ||
    lower.includes('/__tests__/') ||
    lower.includes('/__spec__/')
  );
}

interface FunctionSignature {
  name: string;
  params: string[];
  returnType?: string;
}

function extractFunctionSignatures(hunkLines: string[]): FunctionSignature[] {
  const signatures: FunctionSignature[] = [];

  // Match exported function declarations
  const exportFuncPattern = /^export\s+(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*(\w+))?/;
  // Match exported const arrow functions or methods
  const exportConstPattern = /^export\s+(?:async\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*(?::\s*\w+)?\s*=>\s*{/;
  // Match class methods
  const methodPattern = /^\s*(?:async\s+)?(\w+)\s*\([^)]*\)(?:\s*:\s*\w+)?\s*{/;

  for (let i = 0; i < hunkLines.length; i++) {
    const line = hunkLines[i];

    let match = line.match(exportFuncPattern);
    if (match) {
      const params = match[2]
        ? match[2].split(',').map((p) => p.trim().split(/[:=]/)[0].trim()).filter(Boolean)
        : [];
      signatures.push({
        name: match[1]!,
        params,
        returnType: match[3],
      });
      continue;
    }

    match = line.match(exportConstPattern);
    if (match) {
      signatures.push({
        name: match[1]!,
        params: [],
      });
      continue;
    }

    // Check for method in class context
    if (line.includes('class ') || (i > 0 && hunkLines[i - 1].includes('class '))) {
      const methodMatch = line.match(methodPattern);
      if (methodMatch && methodMatch[1]![0] !== methodMatch[1]![0].toUpperCase()) {
        signatures.push({
          name: methodMatch[1]!,
          params: [],
        });
      }
    }
  }

  return signatures;
}

function checkSignatureChange(
  oldSignatures: FunctionSignature[],
  newSignatures: FunctionSignature[]
): Map<string, { type: 'added' | 'removed' | 'changed'; oldSig?: FunctionSignature; newSig?: FunctionSignature }> {
  const changes = new Map<string, { type: 'added' | 'removed' | 'changed'; oldSig?: FunctionSignature; newSig?: FunctionSignature }>();

  const oldMap = new Map(oldSignatures.map((s) => [s.name, s]));
  const newMap = new Map(newSignatures.map((s) => [s.name, s]));

  for (const [name, oldSig] of oldMap) {
    const newSig = newMap.get(name);
    if (!newSig) {
      changes.set(name, { type: 'removed', oldSig });
    } else if (
      oldSig.params.length !== newSig.params.length ||
      oldSig.returnType !== newSig.returnType
    ) {
      changes.set(name, { type: 'changed', oldSig, newSig });
    }
  }

  for (const [name, newSig] of newMap) {
    if (!oldMap.has(name)) {
      changes.set(name, { type: 'added', newSig });
    }
  }

  return changes;
}

function isExportedFunctionCalled(functionName: string, content: string): boolean {
  const callPattern = new RegExp(`\\b${functionName}\\s*\\(`, 'g');
  return callPattern.test(content);
}

function generateId(analyzerId: string, filePath: string, idx: number): string {
  const base = filePath.split('/').pop() ?? filePath;
  return `${analyzerId}-${base}-${idx}`;
}

export const FunctionSignatureAnalyzer: DiffScopedAnalyzer = {
  id: 'function-signature',
  name: 'Function Signature Analyzer',

  async run(ctx: DiffScopedAnalyzerContext): Promise<{ findings: DiffScopedFinding[] }> {
    const findings: DiffScopedFinding[] = [];

    for (const file of ctx.diffResult.files) {
      if (shouldSkipPath(file.path)) continue;
      if (file.binary) continue;
      if (isTestFile(file.path)) continue;

      const changeType = file.changeType as DiffScopedFinding['introducedBy'];

      // Get hunks for this file
      const fileHunks = ctx.diffResult.hunks.filter((h) => h.filePath === file.path);

      const oldLines: string[] = [];
      const newLines: string[] = [];

      for (const hunk of fileHunks) {
        for (const line of hunk.lines) {
          if (line.type === 'deleted') {
            oldLines.push(line.content);
          } else if (line.type === 'added') {
            newLines.push(line.content);
          }
        }
      }

      const oldSignatures = extractFunctionSignatures(oldLines);
      const newSignatures = extractFunctionSignatures(newLines);

      if (oldSignatures.length === 0 && newSignatures.length === 0) continue;

      const changes = checkSignatureChange(oldSignatures, newSignatures);

      if (changes.size === 0) continue;

      // Check if callers are updated in the diff
      const allChangedContent = ctx.diffResult.files
        .filter((f) => f.path !== file.path && !f.binary)
        .flatMap((f) => {
          const hunks = ctx.diffResult.hunks.filter((h) => h.filePath === f.path);
          return hunks.flatMap((h) => h.lines.filter((l) => l.type === 'added' || l.type === 'context').map((l) => l.content));
        })
        .join(' ');

      for (const [funcName, change] of changes) {
        if (change.type === 'added') continue; // New function, no caller update needed

        const callersUpdated = isExportedFunctionCalled(funcName, allChangedContent);

        if (!callersUpdated && change.type === 'changed') {
          findings.push({
            id: generateId('function-signature', file.path, funcName.length + changes.size),
            severity: 'high',
            category: 'correctness',
            title: `Function signature changed without caller updates`,
            explanation: `The exported function "${funcName}" signature changed but no callers appear to have been updated in the diff. Parameters may have changed - verify all call sites are compatible.`,
            file: file.path,
            introducedBy: changeType,
            pattern: `function:${funcName}`,
            confidence: 85,
          });
        }
      }
    }

    return { findings };
  },
};