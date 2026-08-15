# Release Checklist — Turpan v0.1.0

**Version:** 0.1.0-alpha
**Target:** Public npm publish
**Date:** 2026-06-20

---

## Pre-Release Validation

Run these commands in order. Do not proceed past any failing step.

- [ ] `pnpm install` — succeeds
- [ ] `pnpm build` — all 8 packages build cleanly
- [ ] `pnpm lint` — TypeScript strict mode passes for all packages
- [ ] `pnpm test` — 589 tests pass, 1 skipped
- [ ] `pnpm eval` — 8 fixtures: 1 pass, 7 warn (0 hard failures)
- [ ] `node apps/cli/dist/index.js --version` — prints `0.1.0`
- [ ] `node apps/cli/dist/index.js doctor` — all checks pass

---

## Documentation Audit

- [ ] README.md is consistent:
  - Official test count: **589 passing tests, 1 skipped**
  - Package count: **8 packages** (not 9)
  - Language: "public alpha" (not production-ready / enterprise-ready)
  - License: MIT (LICENSE file exists)
- [ ] `docs/` all present and consistent with README
- [ ] No broken links in README or docs (run `pnpm eval` first to populate `.turpan/`)

---

## Package Metadata Audit

Each published package must have:

- [ ] `@turpan/cli` — `name`, `version`, `description`, `bin`, `license`, `files`, `engines`, `keywords`
- [ ] `@turpan/mcp-server` — `name`, `version`, `description`, `bin`, `license`, `files`, `engines`, `keywords`
- [ ] `@turpan/core` — `name`, `version`, `description`, `license`, `files`, `engines`, `keywords`
- [ ] `@turpan/shared` — `name`, `version`, `description`, `license`, `files`, `engines`, `keywords`
- [ ] `@turpan/ui-runner` — `name`, `version`, `description`, `license`, `files`, `engines`, `keywords`
- [ ] `@turpan/fix-engine` — `name`, `version`, `description`, `license`, `files`, `engines`, `keywords`
- [ ] `@turpan/analyzers` — `name`, `version`, `description`, `license`, `files`, `engines`, `keywords`
- [ ] `@turpan/report` — `name`, `version`, `description`, `license`, `files`, `engines`, `keywords`

---

## Community Files

- [ ] `CONTRIBUTING.md` — exists
- [ ] `CODE_OF_CONDUCT.md` — exists
- [ ] `SECURITY.md` — exists
- [ ] `LICENSE` — MIT, exists
- [ ] `.github/ISSUE_TEMPLATE/bug_report.md` — exists
- [ ] `.github/ISSUE_TEMPLATE/feature_request.md` — exists
- [ ] `.github/PULL_REQUEST_TEMPLATE.md` — exists

---

## Git State

- [ ] `git status --short` — no uncommitted changes (or changes are intentional)
- [ ] `git diff --stat` — reviewed and expected
- [ ] Branch is clean or only has intentional release commits

---

## npm Publish Prep

- [ ] `pnpm pack --dry-run` — review output for each app package
- [ ] `pnpm -r --filter @turpan/cli pack --dry-run` — CLI package dry run
- [ ] `pnpm -r --filter @turpan/mcp-server pack --dry-run` — MCP server dry run
- [ ] Confirm `.npmignore` is working (root workspace not published as single package)
- [ ] Each package has a proper `files: ["dist"]` entry

---

## Community & Launch

- [ ] GitHub release draft created with `RELEASE_NOTES_v0.1.0-alpha.md` content
- [ ] GitHub release tag: `v0.1.0-alpha`
- [ ] GitHub repo has description and topics set
- [ ] No secrets or credentials accidentally included in the published packages

---

## Post-Publish

- [ ] `npm view @turpan/cli@0.1.0` — package is accessible
- [ ] `npm view @turpan/mcp-server@0.1.0` — package is accessible
- [ ] `npx @turpan/cli@0.1.0 --version` — works after global install
- [ ] Update any project URLs that will point to the npm registry

---

## Sign-off

| Check               | Person | Date       |
|---------------------|--------|------------|
| Validation          |        |            |
| Documentation       |        |            |
| Package metadata    |        |            |
| Community files     |        |            |
| Git state           |        |            |
| npm publish         |        |            |

**Final GO/NO-GO:** ________________