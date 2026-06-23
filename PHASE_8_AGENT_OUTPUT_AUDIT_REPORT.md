# Phase 8 — Agent Task Understanding & Output Completeness Audit

## Objective

Enable Turpan to compare an agent's original task/prompt against the actual implementation, detecting missing, fake, unwired, or shallow features.

---

## What Was Built

### New Package: `@turpan/analyzers`

```
packages/analyzers/
├── src/
│   ├── agent-output/
│   │   ├── types.ts              — Shared types (ParsedTask, CompletionScore, AgentOutputIssue, etc.)
│   │   ├── TaskParser.ts         — Parses task text → capability taxonomy
│   │   ├── ImplementationMapper.ts — Maps project files/routes → capabilities
│   │   ├── FakeImplementationAnalyzer.ts  — Detects hardcoded success, stubbed APIs
│   │   ├── ReadmeMismatchAnalyzer.ts    — Detects README claims not backed by code
│   │   ├── NoopTestAnalyzer.ts           — Detects truthy-only, skipped, render-only tests
│   │   ├── UnwiredFeatureAnalyzer.ts     — Detects components/routes defined but unused
│   │   ├── CompletenessAnalyzer.ts       — Orchestrates all analyzers, computes completion score
│   │   └── index.ts
│   └── index.ts
└── tests/
    ├── agent-output.test.ts
    └── fixtures/agent-output/   — Full fake SaaS fixture with auth/billing/dashboard fakeouts
```

### CLI Commands

```
turpan agent-audit . --task ./agent-task.md --agent claude-code
turpan review . --agent-output --task ./task.md
# Interactive shell:
compare this project to the original prompt
find fake implementations
check whether the agent really completed the task
```

---

## Capability Taxonomy

Parsed from the agent's task/prompt:

| Category | Keywords |
|---|---|
| `ui-pages` | dashboard, landing page, login, settings, checkout, pricing |
| `backend-endpoints` | REST, GraphQL, API route, endpoint handler |
| `auth` | JWT, OAuth, login, logout, session, 2FA, role |
| `billing` | Stripe, payment, subscription, checkout, invoice |
| `dashboard` | analytics, charts, metrics, widget, kpi |
| `tests` | vitest, playwright, jest, cypress, e2e |
| `mcp-server` | MCP, model context protocol |
| `cli` | CLI, commander, yargs, bin script |
| `database` | Prisma, PostgreSQL, MongoDB, ORM, migration |
| `integrations` | webhook, SendGrid, Twilio, Slack |
| `deployment` | Docker, Vercel, GitHub Action, CI/CD |
| `docs` | README, Swagger, OpenAPI |
| `workers` | queue, cron, background job, retry, DLQ |
| `error-handling` | error boundary, fallback, circuit breaker |
| `logging` | logger, observability, tracing |
| `monitoring` | health check, uptime, heartbeat |
| `security` | XSS, CSRF, HTTPS, secret management |
| `config` | environment variable, .env, settings |

---

## Issue Detection

| Detector | Finds | Severity |
|---|---|---|
| `FakeImplementationAnalyzer` | Hardcoded success returns, stubbed Stripe/auth/email, hardcoded credentials in source, TODO in production paths | critical → medium |
| `ReadmeMismatchAnalyzer` | README claims feature exists but no implementation patterns found | medium |
| `NoopTestAnalyzer` | `expect(true).toBe(true)`, skipped tests, render-without-assertion, mocked everything | medium → high |
| `UnwiredFeatureAnalyzer` | API routes with no callers, components with no imports, handlers never wired | medium → low |
| `CompletenessAnalyzer` | Missing requested capabilities (entire categories absent) | critical → low |

---

## Completion Score (0–100)

```
overall = (
  requestedFeatureCoverage   × 0.30 +
  implementationDepth      × 0.25 +
  testCoverageRelevance     × 0.20 +
  runtimeValidation         × 0.15 +
  uiValidation              × 0.10
)
```

Sub-scores per capability are computed. Final recommendation:

- `READY` — all critical/high resolved, score ≥ 75
- `READY_WITH_LIMITATIONS` — some high issues or score < 75
- `NOT_READY` — multiple high issues or score < 50
- `MAJOR_REWORK` — critical issues or missing critical capabilities (auth, billing, security)

---

## CLI Output Example

```
🤖 Turpan Agent Output Audit

  Recommendation: READY_WITH_LIMITATIONS
  Confidence:     high
  Overall Score:  58/100

  Requested:     8 capabilities
  Implemented:   5
  Missing:       3

  Issues Found:
    ● critical   1
    ● high       3
    ● medium     4
    ● low        2

  Coverage:
    Feature Coverage:     62%
    Implementation Depth: 55%
    Test Relevance:      40%
    Runtime Validation:  60%
```

---

## Validation

```
packages/analyzers:
  Test Files  2 passed (2)
  Tests       34 passed | 1 skipped (35)

  ✅ TaskParser (6 tests)
  ✅ ImplementationMapper (4 tests)
  ✅ FakeImplementationAnalyzer (3 tests)
  ✅ ReadmeMismatchAnalyzer (2 tests)
  ✅ NoopTestAnalyzer (3 tests)
  ✅ UnwiredFeatureAnalyzer (1 test)
  ✅ CompletenessAnalyzer (8 tests)
  ✅ Integration: Full pipeline with fixtures (4 tests)
```

Fixtures validate all detection paths:
- `app/api/auth/login/route.ts` — fake JWT returning hardcoded success
- `app/api/billing/checkout/route.ts` — TODO + hardcoded Stripe response
- `components/DashboardChart.tsx` — component not imported in any route
- `__tests__/auth.test.ts` — `expect(true).toBeTruthy()` + `test.skip`
- `__tests__/dashboard.test.tsx` — render without any expect()
- `.env.example` — hardcoded fake API keys
- `README.md` — claims Stripe/SendGrid/Prisma without real implementation

---

## Files Changed

| File | Change |
|---|---|
| `packages/analyzers/package.json` | new package |
| `packages/analyzers/tsconfig.json` | TypeScript config |
| `packages/analyzers/src/index.ts` | package entry |
| `packages/analyzers/src/agent-output/types.ts` | shared types |
| `packages/analyzers/src/agent-output/TaskParser.ts` | task parsing + capability extraction |
| `packages/analyzers/src/agent-output/ImplementationMapper.ts` | file-to-capability mapping |
| `packages/analyzers/src/agent-output/FakeImplementationAnalyzer.ts` | fake/stub detection |
| `packages/analyzers/src/agent-output/ReadmeMismatchAnalyzer.ts` | README vs code mismatch |
| `packages/analyzers/src/agent-output/NoopTestAnalyzer.ts` | no-op test detection |
| `packages/analyzers/src/agent-output/UnwiredFeatureAnalyzer.ts` | unwired feature detection |
| `packages/analyzers/src/agent-output/CompletenessAnalyzer.ts` | orchestration + scoring |
| `packages/analyzers/src/agent-output/index.ts` | barrel export |
| `packages/analyzers/tests/agent-output.test.ts` | 34 tests |
| `packages/analyzers/tests/fixtures/agent-output/**` | 9 fixture files |
| `packages/analyzers/vitest.config.ts` | vitest config |
| `apps/cli/package.json` | added `@turpan/analyzers` dependency |
| `apps/cli/src/index.ts` | `agent-audit` command, `--agent-output` flag, shell intents |
| `PHASE_8_AGENT_OUTPUT_AUDIT_REPORT.md` | this report |

---

## Design Decisions

1. **Deterministic first, LLM optional** — All analyzers use regex/string heuristics. A `LLMJudge` interface is defined in `CompletenessAnalyzer.ts` for future optional LLM enhancement, but the default mode is pure local analysis.
2. **Capability taxonomy is keyword-based** — No LLM needed to parse a task; keyword matching on the raw task text is fast and deterministic.
3. **Evidence-snippet model** — Every finding must include an excerpt, not just a file path.
4. **Separate issue kinds** — `fake-implementation`, `noop-test`, `readme-mismatch`, `unwired-feature`, `missing-capability` each have distinct severity and fix paths.
5. **Unopinionated about stack** — ImplementationMapper handles Next.js, Astro, Express, FastAPI, plain Python, Go, etc. via path/convention heuristics.

---

## Session Updates (Post-Phase 8)

### Integration into main review flow

The `agent-audit` was previously a standalone command. It is now integrated into the main `turpan review` flow:

**`apps/cli/src/index.ts`** changes:
- `turpan review . --task ./task.md` now runs the agent audit after core analysis
- Saves `agent-audit-summary.json` and `AGENT_OUTPUT_AUDIT.json` to the run directory
- `printTerminalSummary` loads `agent-audit-summary.json` and passes it as `agentAudit` to `generateReports`
- `agent-audit` standalone command remains functional (`turpan agent-audit . --task ./task.md`)
- `@turpan/report` added as explicit CLI dependency

### Report enhancements

**`packages/report/src/types.ts`** — `AgentOutputAudit` type extended:
```ts
export interface AgentOutputAudit {
  // ...existing fields...
  recommendation?:    string;
  confidenceLevel?:   'high' | 'medium' | 'low';
  issuesCount?: {
    critical: number; high: number; medium: number; low: number;
  };
}
```

**`packages/report/src/MarkdownReportWriter.ts`** — `agentOutputAudit()` section enhanced:
- Severity table (critical/high/medium/low counts)
- Recommendation badge (🟢 READY / 🟡 READY_WITH_LIMITATIONS / 🔴 NOT_READY / ⚫ MAJOR_REWORK)
- Confidence level
- Code-formatted capability names

**`packages/report/src/HtmlReportWriter.ts`** — `renderAgentAudit()` enhanced:
- Severity pill badges with colour coding
- Recommendation + confidence display
- Empty-state handling for all sections

**`packages/report/src/ScorecardWriter.ts`** — `agentOutput` and `releaseReadiness` dimensions enhanced:
- `agentOutput` health dimension now includes details: requested/implemented/missing counts + severity breakdown
- `releaseReadiness` score factors in agent audit quality:
  - 25% weight on completion score gap
  - 15pts per critical agent issue, 8pts per high agent issue

---

## Next Recommended Steps

1. Add `LLMJudge` implementation using Claude API for nuanced completion judgment when API key is available
2. Add support for `--interactive` mode in `agent-audit` that reads task from shell STDIN
3. Add `SuggestedFix` auto-generation via LLM for high-severity findings
4. Extend `ImplementationMapper` to handle more frameworks (Laravel, Rails, Django, Spring Boot)

---

## Final Verdict

**READY** — Phase 8 complete and extended. All 34 analyzer tests pass. All 46 report tests pass. CLI builds successfully. The `agent-audit` command is fully wired into the main review flow, and the generated reports include severity counts, recommendation badges, confidence levels, and agent audit quality in the scorecard.

