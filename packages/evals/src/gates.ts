import type { V1QualityGates } from './types.js';

export const PROPOSED_V1_GATES: V1QualityGates = {
  criticalSecurityRecall: 0.9,
  highSeverityPrecision: 0.85,
  maxOverallFalsePositiveRate: 0.2,
  minReproductionSuccessRate: 0.75,
  minPatchSuccessRate: 0.6,
  maxPatchRegressionRate: 0.05,
  maxCrashRate: 0.02,
};
