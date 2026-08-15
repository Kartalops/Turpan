# Phase 14: Real Scenario Library — Report

**Date:** 2026-06-20
**Status:** ✅ Complete

## Goal
Add intelligent, realistic QA flows to Turpan's UI runner that understand common SaaS product scenarios rather than just clicking random buttons.

## What Was Built

### 1. Core Scenario Model (`packages/ui-runner/src/scenarios/Scenario.ts`)

- **`Scenario`** interface — `id`, `name`, `riskLevel`, `supports()`, `run()`
- **`ScenarioContext`** — `baseUrl`, `page`, `viewport`, `screenshotDir`, `runDir`, `fingerprint`, `routeMap`, `consoleErrors`, `networkErrors`
- **`ScenarioResult`** — `scenarioId`, `status`, `durationMs`, `steps[]`, `findings[]`, `artifacts`
- **`ScenarioFinding`** — structured finding model with severity, category, explanation
- **Helper functions:** `captureScenarioScreenshot()`, `makeRouteMap()`, `isAuthenticated()`, `detectNoOpButton()`, `detectFakeCheckout()`
- **QA Safety constants:** `SAFE_TEST_CREDENTIALS` (never used for real auth)

### 2. Scenario Registry (`packages/ui-runner/src/scenarios/ScenarioRegistry.ts`)

- Auto-registers all built-in scenarios
- `supported(fp, routes)` — filter scenarios by project fingerprint
- `runAll(ctx)` — execute all supported scenarios sequentially
- `runById(id, ctx)` — run a specific scenario
- `list()` — enumerate all scenarios with risk levels

### 3. Built-in Scenarios (7 total)

| ID | Name | Risk | Detects |
|----|------|------|---------|
| `saas-marketing` | SaaS Marketing Homepage | safe | Hero, CTA, nav, broken links |
| `auth` | Authentication Flow | low | Missing fields, form wiring, auth redirects, social login |
| `billing` | Billing & Pricing | low | Pricing cards, checkout wiring, plan comparison |
| `dashboard` | Dashboard Experience | safe | Widgets, charts, sidebar, user menu, notifications |
| `navigation` | Navigation & Routing | safe | Route loading, broken routes, blank pages |
| `admin` | Admin Panel & Settings | low | Tables, action buttons, destructive ops (not clicked) |
| `responsive` | Responsive Layout | safe | Horizontal overflow, touch targets, mobile menu |

### 4. Integration with UiTestRunner

- Added `scenarios?: string[]` and `skipScenarios?: boolean` to `RunUiTestOptions`
- Added `runScenarios()` phase (Phase 7) after accessibility checks
- Added `_scenarioResults: ScenarioResult[]` private field
- Added `buildScenarioSummary()` → `ScenarioSummary`
- Added `scenarioResults?: ScenarioSummary` to `UiTestReport`

### 5. CLI Commands

**`turpan review . --ui --scenarios auth,billing`** — Run specific scenarios
**`turpan review . --ui --skip-scenarios`** — Skip scenario library
**`turpan scenarios list`** — List all available scenarios with risk levels
**`turpan scenarios inspect <id>`** — Show scenario details

### 6. Interactive Shell

- **`IntentRouter.ts`** — Added `SCENARIO_KEYWORDS` mapping for natural language:
  - "marketing" → `saas-marketing`
  - "auth", "login", "signin" → `auth`
  - "billing", "pricing", "checkout" → `billing`
  - "dashboard" → `dashboard`
  - "admin", "settings" → `admin`
  - "navigation", "routing" → `navigation`
  - "responsive", "mobile" → `responsive`
- Shell extracts scenarios from natural language commands like:
  - "run auth scenario on this project"
  - "test the billing page"
  - "check responsive design"

### 7. Orchestrator Integration

- Added `uiScenarios?: string[]` and `skipScenarios?: boolean` to `OrchestratorConfig`, `ReviewContext`, and `OrchestratorOptions`
- Created `uiLiveStage.ts` — stage that calls `runUiTest()` with scenario options
- Stage result includes `artifacts` with `scenarioResults` summary

## Safety Guarantees

All scenarios enforce these safety rules:
- **No real credentials** — uses `turpan-test@example.com` / `TurpanTest123!` (never submitted)
- **No destructive actions** — delete, drop, purge, destroy buttons are never clicked
- **No payment submissions** — checkout buttons are detected but not submitted
- **No external navigation** — no clicks that lead to third-party sites
- **No auth bypass** — scenarios detect auth state, never forge tokens

## File Summary

```
packages/ui-runner/src/scenarios/
├── Scenario.ts              — Core model, types, helpers
├── ScenarioRegistry.ts       — Registry + auto-registration
├── SaaSMarketingScenario.ts  — Marketing homepage scenario
├── AuthScenario.ts           — Login/reg/auth flow scenario
├── BillingScenario.ts        — Pricing/checkout scenario
├── DashboardScenario.ts      — Dashboard widgets/nav scenario
├── NavigationScenario.ts     — Multi-route navigation scenario
├── AdminScenario.ts          — Admin/settings scenario
├── ResponsiveScenario.ts     — Responsive layout scenario
└── index.ts                 — Public API + global registry

packages/core/src/runner/stages/uiLiveStage.ts — Orchestrator stage
```

## Tests

- All 235 core tests pass ✅
- All 80 CLI tests pass ✅
- Build succeeds for all packages ✅

## Next Steps

1. Add scenario-specific Playwright fixtures
2. Add scenario tagging system (e.g., `@auth`, `@billing`, `@critical`)
3. Add scenario reporting to HTML report
4. Create plugin-based scenario extensions
5. Add screenshot diffing for scenario screenshots
