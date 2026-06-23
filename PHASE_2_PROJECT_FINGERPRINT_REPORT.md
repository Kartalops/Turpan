# Phase 2: Project Fingerprint Engine — Implementation Report

## Summary

Implemented a comprehensive Project Fingerprint Engine that inspects repositories and produces structured `ProjectFingerprint` objects describing what kind of project is being reviewed.

## Implemented Detectors

### Core Detectors

| Detector | File | Description |
|----------|------|-------------|
| `detectProject` | `detectProject.ts` | Main entry point, orchestrates all detectors |
| `detectPackageManager` | `detectPackageManager.ts` | Detects npm/pnpm/yarn/bun from lock files |
| `detectFrameworks` | `detectFrameworks.ts` | Detects app type, UI/backend frameworks, test tools, DB, auth |
| `detectScripts` | `detectScripts.ts` | Parses package.json scripts, categorizes into build/dev/test/lint |
| `detectRoutes` | `detectRoutes.ts` | Detects Next.js app/pages router routes, Vite routes, entrypoints |
| `detectEnv` | `detectEnv.ts` | Detects .env files and required env vars (secrets redacted) |
| `detectGit` | `detectGit.ts` | Enhanced git detection with tags and remotes |

### ProjectFingerprint Output

```typescript
interface ProjectFingerprint {
  projectRoot: string;
  projectName: string;
  repositoryStatus: { isGitRepo, branch?, commitHash?, isDirty? };
  packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun' | 'unknown';
  lockFile?: string;
  languages: string[];
  runtimeType: RuntimeType;
  appType: AppType;
  uiFramework: UIFramework;
  backendFramework: BackendFramework;
  testTools: TestTool[];
  buildCommands: string[];
  devCommands: string[];
  lintCommands: string[];
  typecheckCommands: string[];
  testCommands: string[];
  packageScripts: Record<string, string>;
  dockerAvailable: boolean;
  dockerComposeAvailable: boolean;
  envFiles: string[];
  envRequirements: EnvRequirement[];
  routeHints: RouteHint[];
  entrypoints: Entrypoint[];
  databaseHints: DatabaseHint[];
  authHints: AuthHint[];
  deploymentHints: DeploymentHint;
  detectedFiles: string[];
  missingFiles: string[];
  fingerprintedAt: string;
}
```

## Supported Project Types

| App Type | Detection Method |
|----------|------------------|
| Next.js SaaS | `dependencies.next` + Prisma/NextAuth |
| Vite React | `dependencies.vite` + `dependencies.react` |
| Node.js Backend | Express/Fastify/NestJS without React |
| Python Bot | `bot.py` + `requirements.txt` |
| FastAPI | `pyproject.toml` with fastapi, or `main.py` + fastapi dep |
| Telegram Bot | `node-telegram-bot-api`, `telegraf`, or `telegram` packages |
| Chrome Extension | `manifest.json` at root |
| MCP Server | `@modelcontextprotocol/sdk` or `mcp` package |
| Docker Project | Dockerfile at root (without other framework indicators) |
| Unknown | Fallback when no pattern matches |

## Security Features

- **Secret Redaction**: `redactSecrets()` and `looksLikeSecret()` in `ProjectFingerprint.ts`
- **Env vars never exposed**: Only names and existence are reported, not values
- **Pattern-based detection**: API keys, tokens, and secrets are detected and redacted from any string output

## CLI Integration

### `turpan inspect .` Command
```bash
turpan inspect [path] [--json]
```
- Displays project fingerprint summary
- Saves fingerprint to `.turpan/runs/latest/project-fingerprint.json`
- `--json` flag outputs raw JSON

### Interactive Shell Display
When running `turpan` without commands, the detected project summary is now shown:
```
🐪 Welcome to Turpan
📁 Project Detected
  Project: my-saas-app
  Type: nextjs
  Languages: TypeScript
  Package Manager: pnpm
  Scripts: build: build | dev: dev | test: test
  ...
```

## Test Fixtures

| Fixture | Location | Purpose |
|---------|----------|---------|
| Next.js SaaS | `tests/fixtures/nextjs-saas/` | Next.js with Prisma, NextAuth, Supabase |
| Vite React | `tests/fixtures/vite-react/` | Vite + React + Vitest |
| Python Bot | `tests/fixtures/python-bot/` | Telegram bot with redis |
| FastAPI | `tests/fixtures/fastapi-app/` | FastAPI with JWT auth |
| Chrome Extension | `tests/fixtures/chrome-extension/` | manifest.json v3 extension |
| Unknown | `tests/fixtures/unknown-project/` | Empty project for fallback testing |

## Test Results

```
✓ tests/fingerprint.test.ts (36 tests)
  - detectPackageManager: 3 tests
  - detectGit: 1 test
  - detectFrameworks: 6 tests
  - detectScripts: 4 tests
  - detectEnv: 4 tests
  - detectProject (per fixture): 10 tests
  - formatFingerprintSummary: 2 tests
  - Redaction: 4 tests
```

## Limitations

1. **Python package detection**: Uses `pyproject.toml` content parsing for FastAPI/Django/Flask detection; may miss projects using only `requirements.txt`
2. **Route detection**: Limited to Next.js app/pages router and basic file-based routing; complex routing (TanStack Router, React Router v7) not detected
3. **Framework inference**: When `package.json` is missing, falls back to file-based detection which may be incomplete
4. **Language detection**: Relies on file extension and config file presence; may not detect all languages in polyglot projects
5. **Docker projects**: Detected by Dockerfile presence, but actual Dockerfile analysis (base image, dependencies) not implemented

## Files Changed

| File | Change |
|------|--------|
| `packages/core/src/project/ProjectFingerprint.ts` | New: Types and redaction utils |
| `packages/core/src/project/detectProject.ts` | New: Main fingerprinting entry |
| `packages/core/src/project/detectPackageManager.ts` | New: Lock file detection |
| `packages/core/src/project/detectFrameworks.ts` | New: Framework detection |
| `packages/core/src/project/detectScripts.ts` | New: Script parsing |
| `packages/core/src/project/detectRoutes.ts` | New: Route and entrypoint detection |
| `packages/core/src/project/detectEnv.ts` | New: Env file detection |
| `packages/core/src/project/detectGit.ts` | New: Git metadata |
| `packages/core/src/project/index.ts` | Updated: Export all fingerprint modules |
| `packages/core/src/context/index.ts` | Updated: Use ProjectFingerprint |
| `apps/cli/src/index.ts` | Updated: Add inspect command |
| `packages/core/tests/fingerprint.test.ts` | New: 36 tests |
| `packages/core/tests/fixtures/*/` | New: 6 test fixtures |

## Next Steps (Future Phases)

- [ ] Real code analyzers using fingerprint to select appropriate rules
- [ ] Dockerfile analysis (base image, multi-stage detection)
- [ ] More sophisticated route detection for SPA frameworks
- [ ] Language detection for Go, Rust, Java, PHP, Ruby
- [ ] Package dependency graph analysis
- [ ] Integration with actual test/lint/build runners

## Validation

| Check | Result |
|-------|--------|
| `pnpm build` | ✅ Pass |
| `pnpm -r run build` | ✅ Pass |
| `cd packages/core && npx vitest run` | ✅ 36 tests pass |
| `node apps/cli/dist/index.js inspect .` | ✅ Works |
| `node apps/cli/dist/index.js review .` | ✅ Works |
| Fingerprint saved to `.turpan/runs/latest/` | ✅ Works |

## Final Verdict

**READY** — Project Fingerprint Engine is implemented and functional. All acceptance criteria met:
- ✅ Comprehensive ProjectFingerprint type with all requested fields
- ✅ Detection for Next.js, Vite React, Python Bot, FastAPI, Chrome Extension, Unknown projects
- ✅ Secret redaction for env vars and API keys
- ✅ `turpan inspect .` command works
- ✅ Fingerprint saved to `.turpan/runs/latest/project-fingerprint.json`
- ✅ Interactive shell shows detected project summary
- ✅ 36 unit tests passing
- ✅ All fixtures created and validated
