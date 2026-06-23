# Public Alpha Go/No-Go Decision — Turpan

**Date:** 2026-06-20
**Phase:** 15 (Final Hardening & Release)
**Reviewers:** Phase 15 team
**Decision:** ✅ **GO**

---

## Decision

**Turpan is GO for public alpha release.**

Suitable for:
- ✅ Individual developers
- ✅ Small teams
- ✅ CI pipelines (read-only mode)
- ✅ AI agent integration (via MCP server)

Not yet suitable for:
- ❌ Production-critical workflows without human review
- ❌ Mission-critical infrastructure
- ❌ Compliance-required environments (until formal audit)

---

## Decision criteria

The go/no-go decision was based on the following criteria. All are **met**.

### 1. Functional ✅

| Criterion                                 | Status |
|-------------------------------------------|--------|
| `pnpm install` works                      | ✅      |
| `pnpm build` works                        | ✅      |
| `pnpm test` works                         | ✅      |
| `pnpm eval` works                         | ✅      |
| CLI works locally                         | ✅      |
| Interactive shell works                   | ✅      |
| Basic UI test works on fixture            | ✅      |
| Report generation works                   | ✅      |
| MCP server starts                         | ✅      |
| All 8 eval fixtures pass or warn          | ✅      |

### 2. Quality ✅

- 589 tests pass (1 pre-existing skipped).
- TypeScript strict mode across all packages.
- Eval suite covers 8 distinct real-world scenarios.

### 3. Reliability ✅

- Stage-level error boundaries prevent one failure from cascading.
- Process cleanup on SIGINT/SIGTERM/exit/uncaughtException.
- Stable run directory handling.
- Graceful handling of missing dependencies and unknown project types.

### 4. Performance ✅

- `node_modules`, `dist`, `build`, `.next`, `.turpan` all skipped by default.
- `ignore.paths` and `ignore.globs` supported via `compileGlob()`.
- Fingerprint cached per-process.
- Deep analysis is opt-in.

### 5. Security ✅

- Read-only by default.
- No shell injection (argv parsing, no `shell: true`).
- Secret redaction in all outputs.
- Path traversal blocking in MCP server.
- Workspace allowlist in MCP server.
- Destructive UI actions forbidden by framework.
- Plugin code is explicit (no implicit loading).

See `FINAL_SECURITY_REVIEW.md` for details.

### 6. Documentation ✅

11 doc files covering every aspect:
- `INTRODUCTION.md`
- `CLI_USAGE.md`
- `INTERACTIVE_SHELL.md`
- `TURPAN_ANALYSIS_REPORT.md`
- `UI_TESTING.md`
- `FIX_ENGINE.md`
- `MCP_SERVER.md`
- `PLUGINS.md`
- `SECURITY_MODEL.md`
- `CONFIGURATION.md`
- `REAL_SCENARIOS.md`

Plus a comprehensive `README.md` with quick-start, examples, and output samples.

### 7. CI ✅

GitHub Actions workflow covers:
- `install` — `pnpm install --frozen-lockfile`
- `lint` — typecheck all packages
- `typecheck` — full build with strict TypeScript
- `test` — full vitest suite
- `build` — full build + CLI smoke test
- `eval` — eval fixtures + artifact upload

See `.github/workflows/ci.yml`.

---

## Risk assessment

| Risk                                                   | Severity | Mitigation                            |
|--------------------------------------------------------|----------|---------------------------------------|
| Plugin code runs in-process                            | Medium   | Explicit listing required             |
| Eval fixtures have fake-looking secrets                | Low      | Test files skipped by redaction filter |
| Browser tests are slow in CI                           | Low      | `--ui --skip-scenarios` available     |
| No production-grade audit                              | Medium   | Documented as future work             |
| Single-process model doesn't scale to multi-project   | Medium   | Acceptable for individual developers  |

**No P0 (critical) risks identified.**

---

## What we're explicitly NOT promising

- ❌ Autonomous code modification
- ❌ Production-ready security guarantees
- ❌ Compliance certifications (SOC2, ISO 27001, etc.)
- ❌ 24/7 support
- ❌ Backwards compatibility beyond v1.x

---

## Rollout plan

### Phase 1: Soft launch (now)

- ✅ Publish to internal users.
- ✅ Collect feedback via GitHub issues.
- ✅ Bug fixes on a best-effort basis.

### Phase 2: Public alpha (next 4 weeks)

- Publish `v0.1.0` to npm.
- Write a launch blog post.
- Share in relevant communities (Hacker News, Reddit r/programming).
- Continue collecting feedback.

### Phase 3: Public beta (4–8 weeks)

- Address feedback from alpha.
- Expand plugin ecosystem.
- Add multi-project support.
- Formal security audit.

### Phase 4: v1.0 (8–12 weeks)

- Stable API.
- Backwards-compatibility guarantees.
- Performance optimizations.
- Documentation polish.

---

## Sign-off

| Reviewer              | Area           | Decision |
|-----------------------|----------------|----------|
| Phase 15 — Build      | Compilation    | ✅ GO    |
| Phase 15 — Tests      | Test coverage  | ✅ GO    |
| Phase 15 — Evals      | Real-world fit | ✅ GO    |
| Phase 15 — Security   | Threat model   | ✅ GO    |
| Phase 15 — Docs       | User-facing    | ✅ GO    |
| Phase 15 — UX         | CLI ergonomics | ✅ GO    |

**Final decision:** ✅ **GO for public alpha.**

---

## Action items

- [x] `pnpm install` works
- [x] `pnpm build` works
- [x] `pnpm test` works
- [x] `pnpm eval` works
- [x] CLI works locally
- [x] Interactive shell works
- [x] Basic UI test works on fixture
- [x] Report generation works
- [x] MCP server starts
- [x] No destructive fixes by default
- [x] Documentation is complete

---

## Next phase

**Phase 16: Public launch preparation.**

Tasks (not blocking alpha release):
- Add a CONTRIBUTING.md
- Add an issue template
- Add a pull request template
- Add a CODE_OF_CONDUCT.md
- Polish the npm package metadata
- Set up Renovate for dependency updates
