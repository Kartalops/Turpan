# 🐪 Turpan

<!-- Badges -->
<div align="center">

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)
![Version](https://img.shields.io/badge/Version-0.1.0-orange?style=for-the-badge)
![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen?style=for-the-badge)

</div>

---

## ✨ Interactive Review & Fix Agent for Real-World Codebases

> **Read-only by default.** Produces patches only when you ask. Never destructive without explicit consent.

Turpan is **not** a simple static scanner. It's an interactive shell, an orchestrator, and a safe fix engine — wrapped around a curated set of analyzers that understand common SaaS, Next.js, Vite, Python, FastAPI, and MCP projects.

---

## 🚀 Quick Start

```bash
# Install & Build
pnpm install && pnpm build

# Verify environment
npx turpan doctor

# Run a deep review
npx turpan review . --deep

# Open the interactive shell
npx turpan
```

---

## 🎯 Key Features

| Feature | Description |
|---------|-------------|
| 🔒 **Read-only by Default** | Never modifies user code unless you ask |
| 🎯 **Bounded Fixes** | Every fix is a small patch, capped at N files |
| 💬 **Natural Language Shell** | Type `review this as a SaaS`, not complex flags |
| 🔌 **Extensible Plugins** | Built-in plugins for Next.js, Vite, Python, FastAPI, MCP, SaaS |
| 🛡️ **AI-Agent Ready** | Full MCP server with workspace allowlist & redaction |
| 🧪 **Real UI Testing** | Playwright-powered scenarios for auth, billing, dashboard |

---

## 📐 Architecture

```
Project ───▶ Detect (fingerprint) ───▶ Plan (stages)
                                             │
                                             ▼
             ◀── Findings + Scorecard ◀── Run stages
                      │
                      ▼
             ◀── Patch (only if --fix) ◀── Fix engine
                      │
                      ▼
                  Apply (only if --apply, with safe categories)
```

---

## ⚡ CLI Examples

### Deep review on a Next.js SaaS

```bash
npx turpan review . --deep --plugins next,saas,security-basic
```

### Run live UI tests

```bash
npx turpan review . --ui --scenarios auth,billing
```

### Generate patches (no apply)

```bash
npx turpan fix . --patch-only
# Inspect .turpan/runs/<runId>/TURPAN_PATCH.diff
```

### Apply only safe fixes

```bash
npx turpan fix . --auto-safe
```

### PR review in CI

```bash
node apps/cli/dist/index.js review . \
  --from main \
  --to HEAD \
  --fail-on critical
```

---

## 🖥️ Interactive Shell

```bash
$ npx turpan

🐪 Turpan — Interactive Review Agent

📋 Project Summary
────────────────────
  Project: my-saas
  Type: nextjs

turpan > analyze this project deeply
  ▶ Running deep review…
  ❌ Verdict: NO_GO
  🔴 1 critical, 2 high

turpan > show findings
  🔴 Hardcoded token in app/api/checkout/route.ts:8
  🟠 TODO: integrate with real payment provider

turpan > fix safe issues
  Patch generated at .turpan/runs/<runId>/TURPAN_PATCH.diff

turpan > open report
  Opening TURPAN_ANALYSIS.html in browser…

turpan > exit
```

---

## 🔐 Safety Model

| Concern | Mitigation |
|---------|------------|
| 🚫 Destructive code changes | Read-only by default; `--apply` is explicit |
| 🚫 Destructive UI actions | Forbidden patterns enforced in the framework |
| 🔒 Secret leakage | Redaction in logs, reports, MCP outputs |
| 🛡️ Path traversal via MCP | Blocked at the schema layer |
| 🔒 Shell injection | `shell: false`, argv parsing only |
| ⚠️ Orphaned processes | SIGKILL on SIGINT/SIGTERM/exit |

---

## 📦 Project Structure

```
turpan/
├── apps/
│   ├── cli/              # CLI entrypoint (turpan command)
│   └── mcp-server/       # MCP server (turpan mcp serve)
├── packages/
│   ├── core/             # Orchestrator, fingerprint, analyzers
│   ├── ui-runner/        # Playwright UI testing
│   ├── analyzers/        # Agent-output audit, completeness checks
│   ├── fix-engine/       # Safe fix engine (patches, rollback)
│   ├── report/           # Markdown/HTML/JSON report writers
│   └── shared/           # Shared types, fs, git, process utils
├── docs/                  # User-facing documentation
├── examples/              # Sample configs & fixtures
└── scripts/              # Eval runner
```

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| 📖 [Introduction](./docs/INTRODUCTION.md) | What & why |
| ⚙️ [CLI Usage](./docs/CLI_USAGE.md) | Every command and flag |
| 🔧 [GitHub Actions](./docs/GITHUB_ACTIONS.md) | PR review workflow |
| 💬 [Interactive Shell](./docs/INTERACTIVE_SHELL.md) | Natural-language commands |
| 📝 [Configuration](./docs/CONFIGURATION.md) | `turpan.yml` reference |
| 🧪 [UI Testing](./docs/UI_TESTING.md) | Playwright scenarios |
| 🔧 [Fix Engine](./docs/FIX_ENGINE.md) | Patches and apply |
| 🔌 [Plugins](./docs/PLUGINS.md) | Built-in and authoring |
| 🤖 [MCP Server](./docs/MCP_SERVER.md) | AI-agent integration |
| 🛡️ [Security Model](./docs/SECURITY_MODEL.md) | Full safety properties |

---

## 🔧 Development

```bash
pnpm install        # Install all workspace deps
pnpm build          # Build all packages
pnpm test           # Run all tests
pnpm lint           # Type check all packages
pnpm eval           # Run eval fixtures
```

---

## ✅ Status

**Public Alpha** — See [`PUBLIC_ALPHA_GO_NO_GO.md`](./PUBLIC_ALPHA_GO_NO_GO.md) for the full release-readiness review. Suitable for individual developers and small teams.

---

## 📄 License

MIT — See [`LICENSE`](./LICENSE).

---

<div align="center">

![Stars](https://img.shields.io/github/stars/Arvuno/Turpan?style=social)
![Forks](https://img.shields.io/github/forks/Arvuno/Turpan?style=social)
![Watchers](https://img.shields.io/github/watchers/Arvuno/Turpan?style=social)

</div>
