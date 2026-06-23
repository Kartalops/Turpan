# UI Testing

Turpan's UI testing stage (`ui-live-basic`) spins up your dev server, opens a
real Chromium browser, navigates every discovered route, captures screenshots,
records console + network errors, and runs the **Real Scenario Library** for
detected product types.

## When to use it

UI testing is **opt-in**. Run it when you want to:

- Catch **hydration errors** that only show up in the browser.
- Detect **console.error / console.warn** emitted on first render.
- Spot **broken routes** (404, 500, blank pages).
- Verify **basic accessibility** (missing alt text, low contrast on images).
- Run **product-aware scenarios** like `auth`, `billing`, `dashboard`.

UI testing is **expensive** — it spawns a real browser. Use it in CI on a
schedule, not on every commit.

## How to enable

```bash
turpan review . --ui                           # include UI stage
turpan review . --ui --scenarios auth,billing  # include specific scenarios
turpan review . --ui --skip-scenarios          # skip scenarios, do checks only
turpan ui-test .                               # standalone UI test command
```

The standalone `ui-test` command is useful when you already have the dev
server running:

```bash
turpan ui-test . --url http://localhost:3000
turpan ui-test . --headed                       # show browser window
turpan ui-test . --mobile                       # mobile viewport only
turpan ui-test . --desktop                      # desktop viewport only
turpan ui-test . --trace                        # save Playwright traces
```

## How it works

1. **Start the dev server.** Turpan reads the `dev` script from `package.json`
   or your `turpan.yml` `commands.dev` override, then spawns it on a free port
   (3000–3010). The server is killed when the test finishes — no orphaned
   processes.
2. **Wait for readiness.** Turpan polls the URL every 2s for up to 30s.
3. **Open Chromium.** A real headless browser launches. By default we test
   both **desktop** (1280×800) and **mobile** (390×844) viewports.
4. **Discover routes.** Routes are extracted from `app/`, `pages/`, and any
   `ROUTE_HINTS` you declared in the fingerprint.
5. **Probe each route.** HTTP probes check 2xx status and reasonable response
   size; failing routes are flagged.
6. **Visit each route in a real browser.** Screenshots are saved, console
   listeners are attached, network listeners are attached.
7. **Run responsive checks.** Horizontal overflow, broken layout, missing
   viewport meta.
8. **Run accessibility checks.** Basic a11y without external dependencies.
9. **Run scenarios** (unless `--skip-scenarios`). See below.

## The Real Scenario Library

Scenarios are product-aware QA flows. They focus on **one specific user journey**
and only do things that are safe (no destructive operations, no real auth
submissions, no payment completion).

### Built-in scenarios

| ID                | Risk  | Detects                                              |
|-------------------|-------|------------------------------------------------------|
| `saas-marketing`  | safe  | Hero, CTA, nav, broken links                         |
| `auth`            | low   | Missing fields, form wiring, auth redirects          |
| `billing`         | low   | Pricing cards, checkout wiring, plan comparison      |
| `dashboard`       | safe  | Widgets, charts, sidebar, user menu, notifications   |
| `navigation`      | safe  | Route loading, broken routes, blank pages            |
| `admin`           | low   | Tables, action buttons (destructive ops NOT clicked) |
| `responsive`      | safe  | Horizontal overflow, touch targets, mobile menu      |

### Authenticated SaaS scenarios (opt-in)

These scenarios are the realistic SaaS flows — they fill and submit login forms,
inspect authenticated dashboards, check settings forms, and probe admin access.
They run in **two modes**:

- **Dry-run (default)** — `testUser.enabled = false`. Login forms are filled
  with safe test data but NOT submitted. Post-login pages are visited only if
  a previous session cookie is detected. No credentials are persisted.
- **Authenticated (opt-in)** — `testUser.enabled = true`. Real seeded login
  runs through `SafeCommandRunner`, with all output redacted. Credentials
  must come from an isolated test account.

| ID                                          | Risk    | What it tests                                                                                   |
|---------------------------------------------|---------|--------------------------------------------------------------------------------------------------|
| `next-saas-auth-good`                       | low     | Submits login (only when `testUser.enabled=true`), verifies redirect, captures before/after screenshots |
| `next-saas-dashboard-empty`                 | safe    | Visits dashboard post-login, detects empty state, checks for console/network errors               |
| `next-saas-settings-noop-save`              | safe    | Inspects profile/settings forms, detects no-op save buttons, identifies destructive actions WITHOUT clicking |
| `next-saas-billing-test-mode`               | low     | Wires up pricing/checkout, calls LOCAL test endpoint (only when `billing.testMode=true`), detects fake success |
| `next-saas-admin-unprotected-authenticated` | medium  | Tests admin unauth access FIRST, verifies non-admin blocked, detects destructive actions NOT clicked  |

### Safety guarantees (ALL scenarios)

All scenarios — including authenticated — enforce:

- **No real credentials.** Forms are inspected but not submitted, unless
  `ui.testUser.enabled: true` is explicitly set in `turpan.yml`.
- **No destructive actions.** Buttons matching `delete`, `drop`, `purge`,
  `destroy`, `remove`, `wipe`, `ban`, `suspend`, `deactivate` are NEVER clicked.
- **No payment submissions.** Real payment domains (`stripe.com`, `paypal.com`,
  `braintree.com`, `squareup.com`, `checkout.stripe.com`) are hard-blocked.
  Only the LOCAL test endpoint (`/api/test-checkout` or similar) is callable.
- **No external navigation.** We never click a link that leads off your domain.
- **No privilege escalation.** Admin scenario never tries to gain admin access
  via manipulation. It only verifies that unauthenticated access is blocked.
- **Passwords are NEVER persisted.** `auth-state.json` includes
  `passwordStored: false` explicitly. Only `email` (not a secret) is kept.
- **Seed commands are redacted.** Output goes through `SafeCommandRunner.summarize()`
  before storage. Only `exit code`, `duration`, and `blocked reason` are saved.

### Adding scenarios to the shell

```text
turpan > run auth scenario
turpan > test the billing flow
turpan > check responsive design
```

## Authenticated SaaS Testing (Phase 27)

To enable real authenticated scenario runs, set `ui.testUser.enabled: true`
in `turpan.yml`. **Credentials must be for an isolated test account** —
Turpan never stores the password in any artifact file.

### `turpan.yml` example

```yaml
ui:
  testUser:
    enabled: true                              # Opt-in (default: false)
    email: "qa-test@example.com"               # Test user email (not a secret)
    password: "qa-test-pass-123"               # Test user password
    seedCommand: "pnpm seed:test-user"         # Optional: seed before auth scenarios
    loginPath: "/login"                        # Path to login page
    dashboardPath: "/dashboard"                # Expected redirect after login
  billing:
    testMode: true                             # Opt-in (default: false)
    checkoutEndpoint: "/api/test-checkout"    # Local test endpoint
```

### Safety properties

- **Opt-in only.** Default is `enabled: false` — no behavior change for existing users.
- **Password not persisted.** Only `auth-state.json` is written with
  `passwordStored: false` explicitly set. `seed.log` contains redacted summary only.
- **Seed command runs through `SafeCommandRunner`** — blocked if dangerous
  patterns are detected, output is summarized before storage.
- **External payment processors hard-blocked.** Even with `billing.testMode=true`,
  Turpan refuses to call any URL containing `stripe.com`, `paypal.com`, `braintree.com`,
  `squareup.com`, or `checkout.stripe.com`.
- **Destructive actions never clicked.** Admin scenario detects buttons like
  `Delete`, `Ban`, `Suspend`, `Deactivate`, `Remove`, `Purge` but does NOT click them.

### Verifying auth safety

Run `turpan scenarios list` to see all registered scenarios. The `riskLevel`
is shown for each:

```bash
$ turpan scenarios list
🎭 Turpan UI Test Scenarios

  auth
    auth                            Authentication Flow       Risk: low
    next-saas-auth-good             SaaS Authenticated Login  Risk: low
    next-saas-admin-unprotected-authenticated  Admin Panel  Risk: medium
    ...
```

Run a single authenticated scenario:

```bash
turpan ui-test . --scenarios next-saas-auth-good
```

## Artifacts

UI tests produce, under `.turpan/runs/<runId>/`:

- `screenshots/<route>-<viewport>.png` — one per route per viewport
- `ui/routes.json` — discovered + probed routes
- `ui/console-errors.json` — every console error captured
- `ui/network-errors.json` — every failed network request
- `ui/interactions.json` — interaction step results
- `ui-test-report.json` — full structured report
- `ui/auth-state.json` — auth state metadata (NEVER includes password)
- `ui/seed.log` — seed command output (redacted summary only)
- `ui/scenario-auth.json` — auth scenario result (canonical Phase 27 name)
- `ui/scenario-dashboard-authenticated.json` — dashboard scenario result
- `ui/scenario-settings.json` — settings scenario result
- `ui/scenario-billing-test-mode.json` — billing test mode result
- `ui/scenario-admin.json` — admin scenario result

### Sample auth-state.json

```json
{
  "enabled": true,
  "email": "qa-test@example.com",
  "loginPath": "/login",
  "dashboardPath": "/dashboard",
  "seedRan": true,
  "seedOutputPreview": "Seed completed (exit:0, duration:1234ms)",
  "scenarioCount": 5,
  "scenarioStatuses": [
    { "id": "next-saas-auth-good", "status": "passed" },
    { "id": "next-saas-dashboard-empty", "status": "warn" }
  ],
  "passwordStored": false
}
```

## Cleaning up after a test

Turpan guarantees no orphaned processes:

- The dev server is killed via SIGTERM, then SIGKILL after 5s if needed.
- The browser is force-closed after a 5s grace period.
- On `SIGINT` (Ctrl-C), both are killed immediately.

If you ever see a stuck `node` or `chromium` process after a Turpan run,
that's a bug — please report it.

## Limitations

- We only test routes that are **discoverable** from the source. Dynamic
  routes that require complex navigation may be missed.
- The browser runs in **headless** mode by default. Use `--headed` to
  watch it visually.
- We don't test **interactive flows** beyond what's in the scenario library.
  Custom flows need a plugin scenario.
- We don't run **JS unit tests** in the browser. Use Vitest / Jest for that.
