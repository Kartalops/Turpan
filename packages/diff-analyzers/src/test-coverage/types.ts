/**
 * @turpan/diff-analyzers — Test coverage types
 */

import type { DiffScopedFinding } from '../types.js';

/**
 * Extended finding type for test coverage findings
 */
export interface TestCoverageFinding extends Omit<DiffScopedFinding, 'category'> {
  category: 'test-coverage';
  testFile?: string;  // related test file if detected
  coverageType: 'missing-test' | 'deleted-test' | 'no-assertion' | 'critical-unchanged';
}

/**
 * Source file change with metadata
 */
export interface SourceFileChange {
  path: string;
  changeType: 'added' | 'modified' | 'deleted' | 'renamed';
  isTestFile: boolean;
  isInfrastructure: boolean;
  basename: string;
  ext: string;
}

/**
 * Test file mapping
 */
export interface TestFileMapping {
  sourceFile: string;
  testFile: string;
  exists: boolean;
}

/**
 * Assertion pattern types
 */
export type AssertionPattern =
  | 'expect'
  | 'assert'
  | 'should'
  | 'chai.expect'
  | 'chai.assert'
  | 'page.expect'
  | 'resolves'
  | 'rejects';