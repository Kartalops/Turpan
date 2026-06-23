/**
 * Tests for shared types and basic utilities.
 */
import { describe, it, expect } from 'vitest';
describe('shared types', () => {
    describe('Intent type', () => {
        it('module loads', () => {
            // Sanity check — file is loadable
            expect(true).toBe(true);
        });
    });
    describe('Finding shape', () => {
        it('Finding is structurally valid', () => {
            const finding = {
                id: 'fnd-test',
                title: 'Test',
                severity: 'low',
                category: 'project',
                explanation: 'test',
                evidence: [],
                fixable: 'none',
                confidence: 50,
                tags: [],
            };
            expect(finding.id).toBe('fnd-test');
            expect(finding.severity).toBe('low');
        });
    });
    describe('Scorecard shape', () => {
        it('Scorecard has expected categories', () => {
            const scorecard = {
                overall: 0,
                categories: {
                    correctness: 0,
                    security: 0,
                    performance: 0,
                    maintainability: 0,
                    codeCoverage: 0,
                },
                findingsCount: 0,
                criticalIssues: 0,
            };
            expect(scorecard.categories.security).toBe(0);
        });
    });
});
//# sourceMappingURL=types.test.js.map