# Turpan v0.1.0-alpha — Release Notes

**Published:** 2026-06-20
**npm:** `@turpan/cli`, `@turpan/mcp-server`
**Type:** Public Alpha

---

## Overview

Turpan v0.1.0-alpha is the first public release of Turpan, an **interactive
review and fix agent** for real-world codebases. It is a public alpha —
suitable for individual developers and small teams, with limitations noted
below.

> ⚠️ **This is an alpha release.** Expect rough edges. Do not use in
> production-critical workflows without human review. See [Known Limitations](#known-limitations).

---

## What's New

### Core Features

- **Fingerprint-based project detection** — automatically identifies Next.js,
  Vite, Python, FastAPI, MCP server projects, and more
- **Multi-stage review pipeline** — build health, test health, code quality,
  security, UI/runtime analysis
- **Natural-language interactive shell** — type `review this as a SaaS` instead
  of memorizing flags
- **Safe fix engine** — generates minimal, bounded, reversible patches; never
  applies without explicit consent
- **Playwright UI testing** — launches a real Chromium browser, discovers routes,
  runs auth/billing/dashboard scenarios
- **Full MCP server** — AI-agent integration via Model Context Protocol, with
  workspace allowlisting and secret redaction

### Supported Project Types

| Type       | Detected By           | Analyzers Applied                  |
|------------|-----------------------|-------------------------------------|
| Next.js    | `next.config.*`       | SaaS, security, UI                  |
| Vite       | `vite.config.*`       | SaaS, security, UI                  |
| Python     | `*.py`, `requirements.txt` | security, runtime, test         |
| FastAPI    | `main.py`, `uvicorn`  | CORS, security, runtime             |
| MCP server | `mcp*.ts`, SDK usage  | tool safety, exec detection         |
| Node.js    | `package.json`        | security, dependencies              |

### Security Properties

- Read-only by default — never modifies code without `--apply` and explicit consent
- Secret redaction in all outputs (logs, reports, MCP)
- No shell injection — `shell: false`, argv-only execution
- Path traversal blocking in MCP server (Zod schema layer)
- Destructive UI actions (`delete`, `drop`, `purge`) forbidden by framework
- Plugin code must be explicitly listed in `turpan.yml`

---

## Test Suite

- **589 passing tests** (1 skipped pre-existing)
- **8 packages** in the workspace
- **8 eval fixtures** covering real-world scenarios:
  - `next-saas-good` — clean positive control ✅
  - `fastapi-open-cors` — CORS detected, warnings ⚠️
  - `mcp-unsafe-tool` — exec detected, warnings ⚠️
  - `next-saas-broken-build` — build required ⚠️
  - `next-saas-fake-billing` — TODO placeholder, warnings ⚠️
  - `next-saas-unprotected-admin` — auth missing, warnings ⚠️
  - `python-bot-hardcoded-token` — token detected ⚠️
  - `vite-ui-console-error` — runtime error, warnings ⚠️

---

## Installation

```bash
# Clone (or use your fork)
git clone <repo-url>
cd Turpan

# Install and build
pnpm install
pnpm build

# Verify
npx turpan doctor

# Run a review
npx turpan review . --deep
```

For AI agent integration:

```bash
# Start the MCP server
npx turpan mcp serve --workspace ./my-project
```

Then configure your AI agent to connect via stdio. See `docs/MCP_SERVER.md`.

---

## Known Limitations

- **Autonomous fixes not supported** — `--apply` requires human-in-the-loop confirmation
- **Single workspace per MCP process** — multi-project support is planned
- **Browser tests are expensive** — CI usage with `--ui` can be slow; use `--scenarios` to limit
- **No production-grade security audit** — treat as a developer tool, not a security product
- **Config is per-project** — no persistent config across runs
- **No multi-tenant MCP** — single workspace per server process

---

## Out of Scope for v0.1.0

- Cloud-hosted Turpan (self-host only)
- Autonomous code modification without human review
- Compliance certifications (SOC2, ISO 27001)
- Multi-project batch review
- Persistent run history across sessions

---

## Breaking Changes in v1.0

These will be addressed before v1.0:

- `turpan.yml` schema may change
- CLI flag names may be renamed for consistency
- MCP server protocol may change
- No backwards compatibility guarantees until v1.0

---

## Upgrade Guide

This is the first public release — there is no prior version to upgrade from.

---

## Links

- **Docs:** `docs/` in this repository
- **Issue Tracker:** GitHub Issues
- **MCP Server Docs:** `docs/MCP_SERVER.md`
- **Security Policy:** `SECURITY.md`

---

## Contributors

This release is the result of 16 development phases. See individual phase
reports (`PHASE_*_REPORT.md`) for the full history.