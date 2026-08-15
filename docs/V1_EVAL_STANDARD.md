# V1 Eval Standard

## Separation

Turpan separates:

- unit tests
- integration tests
- agent capability evals
- review quality evals
- runtime evals
- browser evals
- patch evals

Unit tests do not count as agent quality.

## Golden Corpus

The V1 corpus starts in `@turpan/evals` as `GOLDEN_REVIEW_CORPUS`. It contains real-defect fixtures across:

- security
- correctness
- UI
- CLI
- test quality

Architecture, dependency, adversarial, prompt-injection, and real-repository benchmarks remain required before V1 certification.

## Metrics

Required metrics:

- precision
- recall
- F1
- false positive rate
- false negative rate
- severity/category breakdowns
- critical security recall
- high severity precision
- time to finding
- model calls
- token usage
- estimated cost
- runtime duration
- browser actions
- reproduction success rate
- patch success rate
- patch regression rate
- verifier rejection rate
- crash rate

## Calibration

Confidence is measured in buckets. A 90% confidence bucket should be correct roughly 90% of the time over enough samples. Arbitrary confidence labels are not acceptable.

## Strategy Benchmarking

Compare:

- no LLM
- cheap model
- one strong model
- routed models
- reviewer + verifier
- reviewer + different-provider verifier

Select the smallest strategy that meets quality gates. More models are not assumed better.

## Proposed V1 Gates

```text
criticalSecurityRecall >= 0.90
highSeverityPrecision >= 0.85
overallFalsePositiveRate <= 0.20
reproductionSuccessRate >= 0.75
patchSuccessRate >= 0.60
patchRegressionRate <= 0.05
crashRate <= 0.02
```

Thresholds must not be lowered to obtain a GO result.
