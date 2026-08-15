import type {
  CalibrationBucket,
  EvalCase,
  EvalFinding,
  EvalRun,
  EvalSeverity,
  GateResult,
  QualityMetrics,
  V1QualityGates,
} from './types.js';

export function computeQualityMetrics(cases: EvalCase[], runs: EvalRun[]): QualityMetrics {
  const expected = new Set(cases.flatMap((testCase) => testCase.defects.map((defect) => defect.id)));
  const matched = new Set<string>();
  let falsePositive = 0;

  for (const run of runs) {
    for (const finding of run.findings) {
      const matches = (finding.matchedDefectIds ?? []).filter((id) => expected.has(id));
      if (matches.length === 0) {
        falsePositive += 1;
      } else {
        for (const id of matches) matched.add(id);
      }
    }
  }

  const truePositive = matched.size;
  const falseNegative = expected.size - truePositive;
  return toQualityMetrics(truePositive, falsePositive, falseNegative);
}

export function computeQualityBySeverity(cases: EvalCase[], runs: EvalRun[]): Record<EvalSeverity, QualityMetrics> {
  const severities: EvalSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
  return Object.fromEntries(severities.map((severity) => {
    const scopedCases = cases.map((testCase) => ({
      ...testCase,
      defects: testCase.defects.filter((defect) => defect.severity === severity),
    })).filter((testCase) => testCase.defects.length > 0);
    const scopedRuns = runs.map((run) => ({
      ...run,
      findings: run.findings.filter((finding) => finding.severity === severity),
    }));
    return [severity, computeQualityMetrics(scopedCases, scopedRuns)];
  })) as Record<EvalSeverity, QualityMetrics>;
}

export function computeQualityByCategory(cases: EvalCase[], runs: EvalRun[]): Record<string, QualityMetrics> {
  const categories = new Set(cases.flatMap((testCase) => testCase.defects.map((defect) => defect.category)));
  return Object.fromEntries([...categories].map((category) => {
    const scopedCases = cases.map((testCase) => ({
      ...testCase,
      defects: testCase.defects.filter((defect) => defect.category === category),
    })).filter((testCase) => testCase.defects.length > 0);
    const scopedRuns = runs.map((run) => ({
      ...run,
      findings: run.findings.filter((finding) => finding.category === category),
    }));
    return [category, computeQualityMetrics(scopedCases, scopedRuns)];
  }));
}

export function computeCalibration(findings: EvalFinding[], bucketSize = 10): CalibrationBucket[] {
  const buckets: CalibrationBucket[] = [];
  for (let lower = 0; lower < 100; lower += bucketSize) {
    const upper = lower + bucketSize;
    const bucketFindings = findings.filter((finding) => finding.confidence >= lower && finding.confidence < upper);
    if (bucketFindings.length === 0) {
      buckets.push({ lowerInclusive: lower, upperExclusive: upper, count: 0, accuracy: 0, averageConfidence: 0, calibrationError: 0 });
      continue;
    }
    const correct = bucketFindings.filter((finding) => (finding.matchedDefectIds ?? []).length > 0).length;
    const averageConfidence = bucketFindings.reduce((sum, finding) => sum + finding.confidence, 0) / bucketFindings.length;
    const accuracy = (correct / bucketFindings.length) * 100;
    buckets.push({
      lowerInclusive: lower,
      upperExclusive: upper,
      count: bucketFindings.length,
      accuracy,
      averageConfidence,
      calibrationError: Math.abs(accuracy - averageConfidence),
    });
  }
  return buckets;
}

export function evaluateV1Gates(cases: EvalCase[], runs: EvalRun[], gates: V1QualityGates): GateResult[] {
  const overall = computeQualityMetrics(cases, runs);
  const bySeverity = computeQualityBySeverity(cases, runs);
  const criticalSecurity = filterCategorySeverity(cases, runs, 'SECURITY', 'critical');
  const totals = runs.reduce((sum, run) => ({
    reproductionAttempts: sum.reproductionAttempts + run.stats.reproductionAttempts,
    reproductionSuccesses: sum.reproductionSuccesses + run.stats.reproductionSuccesses,
    patchAttempts: sum.patchAttempts + run.stats.patchAttempts,
    patchSuccesses: sum.patchSuccesses + run.stats.patchSuccesses,
    patchRegressions: sum.patchRegressions + run.stats.patchRegressions,
    crashes: sum.crashes + (run.crashed ? 1 : 0),
  }), {
    reproductionAttempts: 0,
    reproductionSuccesses: 0,
    patchAttempts: 0,
    patchSuccesses: 0,
    patchRegressions: 0,
    crashes: 0,
  });

  return [
    minGate('criticalSecurityRecall', gates.criticalSecurityRecall, criticalSecurity.recall),
    minGate('highSeverityPrecision', gates.highSeverityPrecision, bySeverity.high.precision),
    maxGate('maxOverallFalsePositiveRate', gates.maxOverallFalsePositiveRate, overall.falsePositiveRate),
    minGate('minReproductionSuccessRate', gates.minReproductionSuccessRate, ratio(totals.reproductionSuccesses, totals.reproductionAttempts)),
    minGate('minPatchSuccessRate', gates.minPatchSuccessRate, ratio(totals.patchSuccesses, totals.patchAttempts)),
    maxGate('maxPatchRegressionRate', gates.maxPatchRegressionRate, ratio(totals.patchRegressions, totals.patchAttempts)),
    maxGate('maxCrashRate', gates.maxCrashRate, ratio(totals.crashes, runs.length)),
  ];
}

function filterCategorySeverity(cases: EvalCase[], runs: EvalRun[], category: string, severity: EvalSeverity): QualityMetrics {
  const scopedCases = cases.map((testCase) => ({
    ...testCase,
    defects: testCase.defects.filter((defect) => defect.category === category && defect.severity === severity),
  })).filter((testCase) => testCase.defects.length > 0);
  const scopedRuns = runs.map((run) => ({
    ...run,
    findings: run.findings.filter((finding) => finding.category === category && finding.severity === severity),
  }));
  return computeQualityMetrics(scopedCases, scopedRuns);
}

function toQualityMetrics(truePositive: number, falsePositive: number, falseNegative: number): QualityMetrics {
  const precision = ratio(truePositive, truePositive + falsePositive);
  const recall = ratio(truePositive, truePositive + falseNegative);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return {
    truePositive,
    falsePositive,
    falseNegative,
    precision,
    recall,
    f1,
    falsePositiveRate: ratio(falsePositive, falsePositive + truePositive),
    falseNegativeRate: ratio(falseNegative, falseNegative + truePositive),
  };
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function minGate(gate: keyof V1QualityGates, target: number, actual: number): GateResult {
  return { gate, target, actual, passed: actual >= target };
}

function maxGate(gate: keyof V1QualityGates, target: number, actual: number): GateResult {
  return { gate, target, actual, passed: actual <= target };
}
