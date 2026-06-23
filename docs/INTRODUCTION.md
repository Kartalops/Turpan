# Introduction to Turpan

> **🐪 Turpan** — Interactive review and fix agent CLI for real-world codebases.

## What Turpan is

Turpan is an **interactive review and fix agent** for any project you point it at.
It runs a battery of static and (optional) live-UI checks against your code, produces
structured findings, and — if you allow it — proposes and (with explicit consent) applies
**safe, minimal, reversible** fixes.

Turpan is **not** a simple static scanner. It's a shell, an orchestrator, and a fix
engine, wrapped around a curated set of analyzers that you can extend with plugins.

## Why it exists

Most static-analysis tools drown you in noise and force you to fix problems in your
editor. Turpan is built around three ideas:

1. **Read-only by default.** Nothing in your repo is modified unless you say so.
2. **Bounded fixes.** Every fix is a small, reviewable patch with a clear rollback.
3. **Interactive shell.** You don't have to remember command-line flags — type
   natural-language commands like *"review this as a Python bot"* and let the
   intent router figure out the rest.

## Quick start

```bash
# 1. Install
pnpm install
pnpm build

# 2. Verify your environment
npx turpan doctor

# 3. Initialize a project (creates turpan.yml)
cd your-project
npx turpan init

# 4. Run a review
npx turpan review .

# 5. View the report
npx turpan report
```

That's enough to get useful findings on a real project. For everything else,
see the rest of the docs in this folder.

## What Turpan checks

| Category        | Examples                                                   |
|-----------------|------------------------------------------------------------|
| Build           | `tsc`, `next build`, `vite build`, `npm test` failures     |
| Lint            | `eslint`, `ruff`, `flake8` failures                        |
| Type checking   | TypeScript / mypy errors                                   |
| Static quality  | Dead code, unused exports, duplicate code, complexity      |
| Security        | Hardcoded secrets, SQL injection, XSS, open CORS           |
| Architecture    | API duplication, misplaced modules                         |
| Dependencies    | Unused deps, outdated majors                               |
| Placeholders    | TODOs in production paths, fake success returns           |
| UI (opt-in)     | Live Playwright tests: console errors, hydration, a11y    |
| Agent output    | Compare requested capabilities vs. actual implementation |

## What Turpan does **not** do

- **Turpan never modifies user code by default.** Even when you enable fix mode
  (`--fix` or `--patch-only`), it produces a patch you must inspect and apply.
- **Turpan never executes destructive operations** in scan mode. Buttons that
  say "delete", "drop", or "purge" are detected but never clicked in UI tests.
- **Turpan never submits payments.** The billing UI scenario detects checkout
  buttons but never completes a purchase.

## Who Turpan is for

- Engineers who want a **second pair of eyes** on a PR.
- Tech leads doing **pre-merge audits** without standing up a full CI stack.
- AI agents (Claude Code, Cursor, etc.) that want a **structured, programmatic
  review** they can call as a tool.
- Anyone running **security reviews** on open-source projects.

## Next steps

- **[CLI Usage](./CLI_USAGE.md)** — full command-line reference.
- **[Interactive Shell](./INTERACTIVE_SHELL.md)** — natural-language commands.
- **[Configuration](./CONFIGURATION.md)** — customize with `turpan.yml`.
- **[Real Scenarios](./REAL_SCENARIOS.md)** — see Turpan in action on real projects.
