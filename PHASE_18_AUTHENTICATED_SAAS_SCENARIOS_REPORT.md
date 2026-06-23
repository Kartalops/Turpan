# Phase 18 — Real SaaS Authenticated Scenario Testing

## Objective
Upgrade Turpan's UI testing from basic safe browsing to deeper local SaaS validation with seeded test users and authenticated scenarios, while maintaining the safety guarantees that never use real credentials, never complete real payments, and never perform destructive actions.

---

## Implemented Config

### turpan.yml — `ui.testUser` section

```yaml
ui:
  testUser:
    enabled: false                      # Must explicitly enable
    email: "turpan-test@example.com"   # Isolated test account email
    password: "TurpanTest123!"         # Never a real credential
    seedCommand: ""                    # Optional seeding script
    loginPath: "/login"               # Customizable login route
    dashboardPath: "/dashboard"        # Post-login redirect target
  billing:
    testMode: false                    # Explicit opt-in for test checkout
```

### types.ts — New types

```typescript
export interface TestUserConfig {
  enabled: boolean;
  email: string;
  password: string;
  seedCommand: string;
  loginPath: string;
  dashboardPath: string;
  runSeedBeforeAuth?: boolean;
}

export interface BillingTestConfig {
  testMode: boolean;
}
```

---

## Scenario Behavior

### 1. `next-saas-auth-good` — AuthenticatedAuthScenario

Replaces the safe-only auth detection with real credential submission when `testUser.enabled === true`.

**Flow:**
1. Visit login page (configurable path)
2. Detect login form fields (email + password)
3. Fill credentials — **only fills, never submits** unless `testUser.enabled === true`
4. If enabled: submit form, wait for redirect, capture dashboard URL
5. If disabled: log "testUser.enabled=false — login NOT submitted (QA safety)"
6. Verify redirect to dashboard (if submitted)
7. Detect login errors and report with confidence scores
8. Save auth-state metadata (NO secrets)

**Safety gates:**
- Credentials are filled but form is NOT submitted unless `testUser.enabled === true`
- `seedOutput` only stores exit code + duration, never raw output

### 2. `next-saas-dashboard-empty` — AuthenticatedDashboardScenario

Validates the authenticated dashboard experience, skipping all auth-dependent checks if the session is not authenticated.

**Flow:**
1. Visit dashboard route
2. Check `isAuthenticated()` — if false, skip all checks and set status to `skipped` with reason
3. If authenticated: check meaningful content, click safe nav items, detect console/network errors, detect broken widgets

**Safe nav filtering:** Navigation links with `logout`, `sign out`, `delete`, `cancel`, `remove`, `destroy` are excluded.

### 3. `next-saas-settings-noop-save` — SettingsScenario

Inspects settings/account pages without submitting any changes.

**Flow:**
1. Visit settings routes
2. Inspect all form fields (text, email, password, checkbox, select)
3. Detect no-op save button via URL + DOM diff before/after click
4. Detect destructive settings (`Delete`, `Remove`, `Cancel Account`, etc.) — logged but **NEVER clicked**
5. Dry-run form fill without submit

### 4. `next-saas-billing-test-mode` — BillingTestModeScenario

Reports billing UI wiring status without triggering real payments.

**Flow:**
1. Visit pricing page
2. Check pricing cards for plan names and price visibility
3. For each checkout button: call `detectFakeCheckout()` — reports wired/unwired status
4. If `ui.billing.testMode === true` AND local test checkout endpoint exists (`/api/test-checkout` or `/api/billing/test-checkout`): call it via `fetch`
5. Never calls external Stripe or real payment providers
6. Visit billing account page

**Wiring detection logic:**
- Button is disabled → fake
- Button text has "demo", "coming soon", "disabled" → fake
- Clicking causes no URL change and no DOM change → fake

---

## Seed Command Support

When `ui.testUser.enabled === true` and `ui.testUser.seedCommand` is set, Turpan runs the command through `SafeCommandRunner` before authenticated scenarios:

```typescript
private async runSeedCommand(): Promise<void> {
  const policy = this._safeRunner.checkPolicy(seedCmd);
  if (policy.blocked) {
    this._seedOutput = `[BLOCKED by policy: ${policy.reason}]`;
    return;
  }
  const result = await this._safeRunner.run(seedCmd, { timeoutMs: 60_000 });
  const summary = this._safeRunner.summarize(result);
  this._seedOutput = `Seed completed (exit:${summary.exitCode}, duration:${summary.durationMs}ms)`;
}
```

**Safety guarantees:**
- Policy check blocks dangerous commands before execution
- 60-second timeout enforced
- Output is summarized (exit code + duration only) — never raw stdout/stderr
- Blocked commands are logged with reason, not executed

---

## Safety Guarantees (Never Violated)

| Guarantee | Mechanism |
|---|---|
| No real credentials submitted | `testUser.enabled` must be `true` AND explicitly configured in turpan.yml |
| No real payments completed | `billing.testMode` must be `true` AND only calls local `/api/test-checkout` |
| No secrets in artifacts | Auth state saved without password; seed output is summarized only |
| No destructive actions | Destructive settings detected but never clicked; seed command obeys policy |
| No external service calls | Stripe/payment URLs never navigated to; only local wiring detected |
| No credential logging | `SafeCommandRunner` redacts secrets; summarization strips raw output |

---

## Artifacts Produced

| File | Content |
|---|---|
| `ui/auth-state.json` | Auth config metadata (enabled, paths, seed result) — NO secrets |
| `ui/scenario-next-saas-auth-good.json` | Auth scenario steps + findings + screenshots |
| `ui/scenario-next-saas-dashboard-empty.json` | Dashboard scenario steps + findings + screenshots |
| `ui/scenario-next-saas-settings-noop-save.json` | Settings scenario steps + findings + screenshots |
| `ui/scenario-next-saas-billing-test-mode.json` | Billing scenario steps + findings + screenshots |

---

## Turpan Analysis Report Distinction

The `ScenarioSummary` in `UiTestReport` distinguishes:

```
unauthenticated scenario result  → status: "passed" | "warn" | "failed"
authenticated scenario result    → status: "passed" | "warn" | "failed" | "skipped"
skipped due to no testUser      → status: "skipped", skippedReason: "Not authenticated..."
failed due to login error       → status: "failed", findings: [{ severity: "medium/high", category: "auth", ... }]
```

---

## Fixtures

Five fixtures added as scenario identifiers (ready for fixture directory creation):

| Fixture ID | Scenario | Auth Required | Destructive Safe |
|---|---|---|---|
| `next-saas-auth-good` | AuthenticatedAuthScenario | testUser.enabled | ✓ |
| `next-saas-auth-broken-login` | Auth scenario finding | testUser.enabled | ✓ |
| `next-saas-dashboard-empty` | AuthenticatedDashboardScenario | testUser.enabled | ✓ |
| `next-saas-settings-noop-save` | SettingsScenario | recommended | ✓ |
| `next-saas-billing-test-mode` | BillingTestModeScenario | optional | ✓ |

---

## Validation Results

| Check | Command | Result |
|---|---|---|
| TypeScript build (core) | `pnpm --filter @turpan/core build` | ✅ PASS |
| TypeScript build (ui-runner) | `pnpm --filter @turpan/ui-runner build` | ✅ PASS |
| TypeScript lint | `pnpm lint` | ⚠️ mcp-server project ref pre-existing failures (unrelated) |
| Unit tests | `pnpm test` | ✅ All packages PASS |
| Eval | `pnpm eval` | ⚠️ 8 pre-existing fixture failures (CLI static analysis, unrelated to UI runner) |

---

## Remaining Limitations

1. **Auth sessions are browser-only**: Auth state is not persisted across separate Playwright browser contexts. Authenticated scenarios run in the same context as the login.
2. **OAuth/social login not tested**: AuthenticatedAuthScenario does not handle OAuth flows (Google, GitHub, etc.).
3. **Multi-tenant isolation not verified**: Does not verify that seeded test user data is isolated from production.
4. **No test user auto-creation**: The seedCommand must be provided by the project; Turpan does not generate it.
5. **CSRF/token refresh not handled**: If the app's auth requires token refresh during a scenario, it may fail silently.

---

## Files Changed

| File | Change |
|---|---|
| `turpan.yml` | Added `ui.testUser` and `ui.billing` config sections |
| `packages/core/src/index.ts` | Export `SafeCommandRunner` class |
| `packages/ui-runner/src/types.ts` | Added `TestUserConfig`, `BillingTestConfig` types; updated `UiRunnerConfig` |
| `packages/ui-runner/src/scenarios/Scenario.ts` | Added `testUser`, `billing`, `seedOutput` to `ScenarioContext` |
| `packages/ui-runner/src/scenarios/index.ts` | Registered 4 new scenarios |
| `packages/ui-runner/src/scenarios/AuthenticatedAuthScenario.ts` | **New** — real seeded login |
| `packages/ui-runner/src/scenarios/AuthenticatedDashboardScenario.ts` | **New** — authenticated dashboard |
| `packages/ui-runner/src/scenarios/SettingsScenario.ts` | **New** — settings inspection |
| `packages/ui-runner/src/scenarios/BillingTestModeScenario.ts` | **New** — billing wiring check |
| `packages/ui-runner/src/UiTestRunner.ts` | Seed command runner, testUser/billing config passing, artifact saving |

---

## Final Verdict

**READY** — Phase 18 implemented and validated. All new scenarios build cleanly, tests pass, seed command support obeys policy, and all safety guarantees are enforced through explicit opt-in flags (`testUser.enabled`, `billing.testMode`).
