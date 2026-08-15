# V1 Release Candidate Certification

## Final Architecture Status

The TypeScript control plane, CLI/MCP sibling adapters, deterministic review path, UI runner, and isolated worktree repair path build and execute. Generated dependencies and review artifacts are excluded from version control.

## Final Validation

| Gate | Result |
| --- | --- |
| Install: `corepack pnpm install --frozen-lockfile` | PASS |
| Lint/typecheck: `corepack pnpm -r run lint` | PASS |
| Build: `corepack pnpm -r run build` | PASS |
| Tests: `corepack pnpm -r run test` | PASS (906 active tests) |
| Agent eval: `corepack pnpm eval -- --quiet --hard-fail` | PASS (22/22 fixtures) |
| CLI smoke | PASS |
| MCP smoke | PASS |
| Browser smoke | PASS: real Chromium, local HTTP fixture, screenshots, cleanup |
| Worktree patch smoke | PASS: before fail, after pass, worktree removed |

## Agent Eval And Security

The current deterministic corpus passes all 22 fixtures. The two fixtures tagged `critical` (FastAPI auth bypass and MCP wide filesystem access) were detected, giving critical-security fixture recall of `2/2 = 1.00` for this corpus.

This is not sufficient to certify precision, false-positive rate, calibrated confidence, patch success/regression rate, performance, cost, real-repository breadth, or live-provider strategy. Those measurements remain `INSUFFICIENT_EVIDENCE`; no thresholds were lowered.

## Runtime, Browser And Patching

The release smoke launched installed Playwright Chromium against a temporary local application, collected browser artifacts, and left no browser process. The UI runner was repaired to tolerate absent route hints.

The patch smoke created a temporary Git repository with local identity, created a detached worktree, demonstrated reproduction failure before a minimal patch and success after it, then removed the worktree. The active Turpan checkout was not changed by the experiment.

## Supported Languages

The evaluated corpus covers TypeScript/JavaScript and Python. Go, Rust, Java, and C# are not V1-supported without corresponding eval evidence.

## Exact V1 Gate Table

| Gate | Target | Actual | Status |
| --- | ---: | ---: | --- |
| criticalSecurityRecall | >= 0.90 | 1.00 (2 critical fixtures) | PASS, small sample |
| highSeverityPrecision | >= 0.85 | INSUFFICIENT_EVIDENCE | FAIL |
| overallFalsePositiveRate | <= 0.20 | INSUFFICIENT_EVIDENCE | FAIL |
| reproductionSuccessRate | >= 0.75 | INSUFFICIENT_EVIDENCE | FAIL |
| patchSuccessRate | >= 0.60 | INSUFFICIENT_EVIDENCE | FAIL |
| patchRegressionRate | <= 0.05 | INSUFFICIENT_EVIDENCE | FAIL |
| crashRate | <= 0.02 | INSUFFICIENT_EVIDENCE | FAIL |

## Final Decision

V1_RC_NO_GO

The technical release gates pass. V1 certification is blocked only by missing representative quality, calibration, patch-rate, and benchmark samples.
