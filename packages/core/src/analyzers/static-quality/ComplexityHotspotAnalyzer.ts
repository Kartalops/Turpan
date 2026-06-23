/**
 * Complexity Hotspot Analyzer
 * Detects files, functions, and components that exceed complexity thresholds.
 * Flags: too-large files, too-large functions, too-large React components,
 * too-many nested conditionals.
 */

import type { Analyzer, AnalyzerContext, AnalyzerResult } from '../Analyzer.js';
import type { ProjectFingerprint } from '../../project/index.js';
import { createFinding, confidence } from '../../findings/Finding.js';
import { createEvidence } from '../../findings/Evidence.js';
import { readFile } from 'fs/promises';
import { relative } from 'path';
import { walkFiles } from '../../shared/index.js';

// Thresholds
const MAX_FILE_LINES = 500;
const MAX_FUNCTION_LINES = 80;
const MAX_NESTED_IFS = 4;
const MAX_FUNCTION_LENGTH_LINES = 100;
const MAX_COMPONENT_LINES = 300;
const MAX_CYCLOMATIC = 10;

export class ComplexityHotspotAnalyzer implements Analyzer {
  id = 'complexity-hotspot';
  name = 'Complexity Hotspot Analyzer';
  categories = ['maintainability'];

  supports(fp: ProjectFingerprint): boolean {
    return fp.languages.includes('typescript') || fp.languages.includes('javascript');
  }

  async run(ctx: AnalyzerContext): Promise<AnalyzerResult> {
    const errors: string[] = [];
    const findings = [];

    const files = await this.findSourceFiles(ctx.projectRoot);

    for (const file of files) {
      try {
        const content = await readFile(file, 'utf-8');
        const relPath = relative(ctx.projectRoot, file);
        const lines = content.split('\n');

        // 1. File length check
        if (lines.length > MAX_FILE_LINES) {
          findings.push(
            createFinding({
              id: `large-file-${relPath.replace(/[^a-z0-9]/gi, '-')}`,
              title: `Large file: ${relPath} (${lines.length} lines)`,
              explanation: `File exceeds ${MAX_FILE_LINES} line threshold at ${lines.length} lines. Large files are harder to test, review, and maintain.`,
              severity: lines.length > MAX_FILE_LINES * 2 ? 'high' : 'medium',
              category: 'maintainability',
              fixable: 'manual',
              confidence: confidence(90),
              tags: ['complexity', 'large-file', 'maintainability'],
              file,
              evidence: [
                createEvidence('metric', { value: lines.length, unit: 'lines', label: 'file-length' }),
                createEvidence('file', { path: file, label: 'file', excerpt: `${lines.length} lines total` }),
              ],
              suggestedFix: `Split this file into smaller, focused modules. Extract utility functions, types, and sub-components. Follow Single Responsibility Principle.`,
            })
          );
        }

        // 2. Function complexity analysis
        const functions = this.extractFunctions(content, lines);
        for (const fn of functions) {
          if (fn.lines > MAX_FUNCTION_LINES) {
            findings.push(
              createFinding({
                id: `large-fn-${relPath.replace(/[^a-z0-9]/gi, '-')}-${fn.name}`.substring(0, 60),
                title: `Large function: ${fn.name} (${fn.lines} lines)`,
                explanation: `Function "${fn.name}" in ${relPath} is ${fn.lines} lines (threshold: ${MAX_FUNCTION_LINES}). Large functions are error-prone and hard to test.`,
                severity: fn.lines > MAX_FUNCTION_LINES * 1.5 ? 'high' : 'medium',
                category: 'maintainability',
                fixable: 'manual',
                confidence: confidence(85),
                tags: ['complexity', 'large-function', 'maintainability'],
                file,
                line: fn.startLine,
                evidence: [
                  createEvidence('metric', { value: fn.lines, unit: 'lines', label: 'function-length' }),
                  createEvidence('metric', { value: fn.cyclomatic, unit: '', label: 'cyclomatic-complexity' }),
                  createEvidence('code', { path: file, label: 'function-start', excerpt: `Line ${fn.startLine}: ${fn.signature}` }),
                ],
                suggestedFix: `Extract sub-logic into well-named helper functions. Each function should do one thing. Aim for <${MAX_FUNCTION_LINES} lines per function.`,
              })
            );
          }

          if (fn.cyclomatic > MAX_CYCLOMATIC) {
            findings.push(
              createFinding({
                id: `high-cyclomatic-${relPath.replace(/[^a-z0-9]/gi, '-')}-${fn.name}`.substring(0, 60),
                title: `High cyclomatic complexity: ${fn.name} (${fn.cyclomatic})`,
                explanation: `Function "${fn.name}" has cyclomatic complexity of ${fn.cyclomatic} (threshold: ${MAX_CYCLOMATIC}). High complexity indicates many branching paths that are hard to test.`,
                severity: fn.cyclomatic > MAX_CYCLOMATIC * 2 ? 'high' : 'medium',
                category: 'maintainability',
                fixable: 'manual',
                confidence: confidence(80),
                tags: ['complexity', 'cyclomatic', 'maintainability'],
                file,
                line: fn.startLine,
                evidence: [
                  createEvidence('metric', { value: fn.cyclomatic, unit: '', label: 'cyclomatic-complexity' }),
                ],
                suggestedFix: `Reduce branching paths. Extract complex conditional logic into well-named functions. Use early returns to reduce nesting.`,
              })
            );
          }
        }

        // 3. React component size (for .tsx files)
        if (file.endsWith('.tsx') && lines.length > MAX_COMPONENT_LINES) {
          const componentMatches = content.match(/function\s+([A-Z]\w*)\s*\(|const\s+([A-Z]\w*)\s*=\s*(?:\([^)]*\)|[^=])\s*=>|class\s+([A-Z]\w*)\s*(?:extends|\{|)/g);
          if (componentMatches && componentMatches.length > 0) {
            findings.push(
              createFinding({
                id: `large-component-${relPath.replace(/[^a-z0-9]/gi, '-')}`,
                title: `Large React component file: ${relPath} (${lines.length} lines)`,
                explanation: `React component file exceeds ${MAX_COMPONENT_LINES} lines. Large component files are harder to maintain and test. Consider splitting into sub-components.`,
                severity: lines.length > MAX_COMPONENT_LINES * 1.5 ? 'high' : 'medium',
                category: 'maintainability',
                fixable: 'manual',
                confidence: confidence(85),
                tags: ['complexity', 'large-component', 'react', 'maintainability'],
                file,
                evidence: [
                  createEvidence('metric', { value: lines.length, unit: 'lines', label: 'component-file-length' }),
                ],
                suggestedFix: `Extract sub-components, hooks, and utility functions. A component file should ideally be under ${MAX_COMPONENT_LINES} lines.`,
              })
            );
          }
        }

        // 4. Nested conditionals check
        const nestedIfs = this.findNestedConditionals(content, lines);
        for (const nested of nestedIfs) {
          if (nested.depth > MAX_NESTED_IFS) {
            findings.push(
              createFinding({
                id: `nested-if-${relPath.replace(/[^a-z0-9]/gi, '-')}-${nested.line}`.substring(0, 60),
                title: `Deeply nested conditional at line ${nested.line} (depth: ${nested.depth})`,
                explanation: `Found ${nested.depth}-level nested if/else chain starting at line ${nested.line} in ${relPath}. Deep nesting makes code hard to read and maintain.`,
                severity: nested.depth > MAX_NESTED_IFS * 1.5 ? 'high' : 'medium',
                category: 'maintainability',
                fixable: 'manual',
                confidence: confidence(80),
                tags: ['complexity', 'nesting', 'maintainability'],
                file,
                line: nested.line,
                evidence: [
                  createEvidence('metric', { value: nested.depth, unit: 'levels', label: 'nesting-depth' }),
                  createEvidence('code', { path: file, label: 'nested-code', excerpt: `Line ${nested.line}: ${nested.code.trim().substring(0, 100)}` }),
                ],
                suggestedFix: `Use early returns, extract to helper functions, or use a strategy/table-driven approach to flatten the nesting.`,
              })
            );
          }
        }
      } catch {
        // Skip unreadable files
      }
    }

    return { analyzerId: this.id, findings, durationMs: 0, errors };
  }

  private async findSourceFiles(projectRoot: string): Promise<string[]> {
    const ignoredDirs = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage', '.turpan']);
    return walkFiles({
      cwd: projectRoot,
      extensions: ['ts', 'tsx', 'js', 'jsx'],
      ignoreDirs: ignoredDirs,
    });
  }

  private extractFunctions(content: string, lines: string[]): Array<{
    name: string; startLine: number; lines: number; signature: string; cyclomatic: number;
  }> {
    const functions: Array<{ name: string; startLine: number; lines: number; signature: string; cyclomatic: number }> = [];

    // Match: function name( | function name ( | const name = ( | const name = async (
    const patterns = [
      /^(?:export\s+)?function\s+(\w+)\s*\([^)]*\)/gm,
      /^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>\s*(?:async\s+)?/gm,
      /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/gm,
    ];

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(content)) !== null) {
        const name = match[1] ?? '(anonymous)';
        const startIndex = match.index;
        const startLine = content.substring(0, startIndex).split('\n').length;

        // Find the end of this function (matching brace)
        const braceStart = content.indexOf('{', startIndex);
        if (braceStart === -1) continue;
        const { endIndex } = this.findMatchingBrace(content, braceStart);
        const fnContent = content.substring(braceStart, endIndex + 1);
        const fnLines = fnContent.split('\n').length;
        const cyclomatic = this.cyclomaticComplexity(fnContent);

        functions.push({ name, startLine, lines: fnLines, signature: match[0].trim(), cyclomatic });
      }
    }

    return functions;
  }

  private findMatchingBrace(content: string, start: number): { endIndex: number } {
    let depth = 0;
    for (let i = start; i < content.length; i++) {
      if (content[i] === '{') depth++;
      else if (content[i] === '}') {
        depth--;
        if (depth === 0) return { endIndex: i };
      }
    }
    return { endIndex: content.length };
  }

  private cyclomaticComplexity(fnBody: string): number {
    // Count branching constructs
    const branches = [
      /\bif\b/g,
      /\belse\s+if\b/g,
      /\bfor\b/g,
      /\bwhile\b/g,
      /\bcase\b/g,
      /\bcatch\b/g,
      /\?\s*[^:]*:/g,  // ternary
    ];
    let count = 1; // base complexity
    for (const re of branches) {
      const matches = fnBody.match(re);
      if (matches) count += matches.length;
    }
    return count;
  }

  private findNestedConditionals(content: string, lines: string[]): Array<{ line: number; depth: number; code: string }> {
    const results: Array<{ line: number; depth: number; code: string }> = [];
    const ifStack: Array<{ line: number; depth: number }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Count leading whitespace for depth estimation
      const leadingSpaces = line.search(/\S/);

      // if, else if, for, while — push to stack
      if (/^\s*(?:if|for|while)\s*\(/.test(trimmed)) {
        const depth = ifStack.length + 1;
        ifStack.push({ line: i + 1, depth });
      } else if (/^\s*\}\s*else/.test(trimmed) || /^\s*else\s*\{?/.test(trimmed)) {
        // else branch — depth stays same
      } else if (/^\s*\}/.test(trimmed)) {
        // Closing brace — might indicate end of if/else block
        if (ifStack.length > 0 && leadingSpaces < 4) {
          ifStack.pop();
        }
      }

      // Report if we've seen a deeply nested pattern
      if (ifStack.length >= MAX_NESTED_IFS) {
        const top = ifStack[ifStack.length - 1];
        if (!results.find(r => r.line === top.line)) {
          results.push({ line: top.line, depth: ifStack.length, code: lines[i] });
        }
      }
    }

    return results;
  }
}
