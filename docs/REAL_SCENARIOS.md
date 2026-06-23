# Real Scenarios

This document walks through Turpan end-to-end on three concrete projects:
a Next.js SaaS, a Python Telegram bot, and an MCP server.

## 1. Next.js SaaS — Billing audit

Imagine your team shipped a SaaS with a "fake" billing flow (the API returns
success but never charges anyone). Turpan finds the issue.

### Setup

```bash
git clone https://github.com/acme/my-saas
cd my-saas
pnpm install
npx turpan init
```

`turpan init` creates `turpan.yml`. Edit the plugins section:

```yaml
plugins:
  - next
  - saas
  - security-basic
```

### Run a deep review

```bash
npx turpan review . --deep --ui
```

Output (abridged):

```
🔍 Turpan Review

Project: /home/user/my-saas
Mode: deep | UI

⏳ Analyzing...

[+] Project fingerprint       0.0s
[+] Install check              0.1s
[+] Script detection           0.0s
[+] Build                      12.3s   ✅
[+] Test                       8.4s    ✅
[+] Lint                       1.2s    ✅
[+] Type check                 3.1s    ✅
[+] Static quality             4.5s    ⚠️  3 findings
[+] Security (basic)           2.1s    🔴 1 finding
[+] Dead code                  1.9s    ⚠️  1 finding
[+] UI live                    28.7s   ⚠️  2 findings

🏛️  Turpan Analysis
  /home/user/my-saas/.turpan/runs/2026-06-20T...

  ❌ Verdict: NO_GO
  Overall: 47/100
  🔴 1 critical   2 high   5 medium

✅ Turpan Analysis generated:
  TURPAN_ANALYSIS.md
  TURPAN_ANALYSIS.html
  TURPAN_FINDINGS.json
  ...
```

### Inspect findings

```bash
npx turpan report
```

Excerpt of `TURPAN_ANALYSIS.md`:

```markdown
### 🔴 Hardcoded token in app/api/checkout/route.ts:8

- Category: security
- Confidence: 95%
- File: app/api/checkout/route.ts:8
- Suggested Fix: Move to `process.env.STRIPE_SECRET_KEY` and rotate the
  exposed credential immediately.

### 🟠 TODO: integrate with real payment provider in app/api/checkout/route.ts:11

- Category: agent-output
- Confidence: 90%
- File: app/api/checkout/route.ts:11
- Suggested Fix: Replace the stub with a real Stripe integration.

### 🟠 Billing scenario failed: checkout button not wired

- Category: ui
- File: app/pricing/page.tsx
- Suggested Fix: The "Subscribe" button does not navigate to a checkout
  page; only shows an alert.
```

### Generate patches

```bash
npx turpan fix . --patch-only
```

`TURPAN_FIX_PLAN.md`:

```
## Fix Candidates

### ✅ Safe to apply automatically

| Category     | File                       | Description                                    |
|--------------|----------------------------|------------------------------------------------|
| dependency   | package.json               | Remove unused dep `@types/lodash`              |
| placeholder  | app/api/checkout/route.ts  | Replace fake `TODO: wire up Stripe` with comment |

### ⚠️ Requires manual review

| Category     | File                       | Description                                    |
|--------------|----------------------------|------------------------------------------------|
| security     | app/api/checkout/route.ts  | Move hardcoded Stripe key to env var           |
| ui           | app/pricing/page.tsx       | Wire Subscribe button to real checkout flow    |
```

### Apply safe fixes (manually reviewed)

```bash
npx turpan fix . --apply
```

The two safe fixes are applied. The security and UI fixes are listed in the
plan but NOT applied — they require a human to wire up Stripe properly.

---

## 2. Python Telegram bot — Secret detection

Imagine a Telegram bot with a hardcoded bot token in `bot.py`.

### Setup

```bash
git clone https://github.com/acme/billing-bot
cd billing-bot
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
npx turpan init
```

Edit `turpan.yml`:

```yaml
plugins:
  - python
  - security-basic
```

### Run

```bash
npx turpan review . --deep
```

Output:

```
[+] Static quality        0.8s   ⚠️  1 finding
[+] Security (basic)      1.2s   🔴 1 finding

❌ Verdict: NO_GO
🔴 1 critical
```

The critical finding:

```markdown
### 🔴 Hardcoded token in bot.py:8

- Category: security
- Confidence: 95%
- Evidence: `TELEGRAM_BOT_TOKEN = "7123456789:AAH..."`
- Suggested Fix: Move to `os.environ.get("TELEGRAM_BOT_TOKEN")` and rotate
  the token immediately via @BotFather.
```

### Why this matters

The token in source code is **public** once the repo is pushed. Anyone with
the token can impersonate the bot and read every message it can read.

### Recommended response

1. **Rotate the token** in @BotFather.
2. **Replace the hardcoded value** with `os.environ.get(...)`.
3. **Add `bot.py` to a pre-commit hook** that detects hardcoded secrets
   (`gitleaks`, `detect-secrets`).
4. **Re-run Turpan** to verify the fix landed.

---

## 3. MCP server — Unsafe tool detection

Imagine an MCP server that registers a `run_command` tool which executes
arbitrary shell commands.

### Setup

```bash
git clone https://github.com/acme/unsafe-mcp
cd unsafe-mcp
pnpm install
npx turpan init
```

Edit `turpan.yml`:

```yaml
plugins:
  - mcp
  - security-basic
```

### Run

```bash
npx turpan review . --deep
```

Output:

```
[+] Static quality        0.5s
[+] Security (basic)      1.1s   🔴 1 finding

❌ Verdict: NO_GO
🔴 1 critical
```

The critical finding:

```markdown
### 🔴 MCP server registers tool that executes arbitrary shell commands

- Category: security
- File: src/server.ts
- Confidence: 99%
- Tool: `run_command`
- Suggested Fix: Remove the `run_command` tool entirely. If shell
  execution is required, add an allowlist of permitted commands and
  require explicit user confirmation per call.
```

### Why this matters

An MCP server with arbitrary command execution is **as dangerous as giving
shell access to whoever is talking to the LLM**. An attacker who can craft
prompts to the LLM can chain through to arbitrary file system reads,
credential exfiltration, and remote code execution.

### Recommended response

1. **Remove the tool** — there is no safe version of arbitrary `exec`.
2. If a subset of commands is genuinely needed, write a **dedicated tool
   per command** (e.g. `git_status()`, `npm_install(packages)`) with
   type-safe input schemas.
3. **Re-run Turpan** to verify.

---

## 4. Local workflow — The interactive shell

The interactive shell is where Turpan shines for iterative review.

```bash
npx turpan
```

```text
🐪 Turpan — Interactive Review Agent

📋 Project Summary
────────────────────
  Project: my-saas
  Type: nextjs

turpan > analyze this project deeply

▶ Running deep review…

  Verdict: NO_GO
  🔴 1 critical, 2 high

turpan > show findings

  🔴 Hardcoded token in app/api/checkout/route.ts:8
  🟠 TODO: integrate with real payment provider
  🟠 Billing scenario failed

turpan > fix safe issues

  Patch-only mode — patches generated at:
    .turpan/runs/<runId>/TURPAN_PATCH.diff

turpan > show scorecard

  Overall: 47/100
  Build Health: 90  Test Health: 88  Code Quality: 70
  Security: 30      UI/Runtime: 60

turpan > open report

  Opening .turpan/runs/<runId>/TURPAN_ANALYSIS.html in browser…
```

---

## 5. CI workflow — PR comment

```yaml
# .github/workflows/turpan.yml
name: Turpan
on: [pull_request]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: npx turpan review . --deep --timeout 180
      - uses: actions/upload-artifact@v4
        with:
          name: turpan-report
          path: .turpan/runs/latest/
```

---

## See also

- **[CLI Usage](./CLI_USAGE.md)** — every flag.
- **[Configuration](./CONFIGURATION.md)** — `turpan.yml` reference.
- **[Security Model](./SECURITY_MODEL.md)** — what Turpan does and doesn't.
- **[examples/fixtures/](../examples/fixtures/)** — fixtures you can run
  Turpan against to reproduce these scenarios.
