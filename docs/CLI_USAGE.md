# CLI Usage

This document covers every Turpan CLI command, flag, and exit code.

## Synopsis

```bash
turpan [command] [options]
turpan                     # Open interactive shell
turpan --version           # Print version
turpan --help              # Show help
```

## Commands

| Command                                       | What it does                                         |
|-----------------------------------------------|------------------------------------------------------|
| `turpan`                                      | Open the **interactive shell**                       |
| `turpan doctor`                               | Verify Node, pnpm, and writability                   |
| `turpan init [path]`                          | Create a starter `turpan.yml`                        |
| `turpan inspect [path]`                       | Print the project fingerprint                        |
| `turpan review [path] [opts]`                 | Run the full review pipeline                         |
| `turpan review-diff [path] --base <ref> --target <ref>` | Run a diff-scoped review              |
| `turpan report [path] [opts]`                 | Display / open / export the Turpan Analysis          |
| `turpan cleanup-scan [path]`                  | Read-only scan for unused code / placeholders        |
| `turpan dependency-audit [path]`             | Scan dependencies for CVEs and license issues         |
| `turpan agent-audit [path]`                   | Audit an AI agent's output vs. the original task     |
| `turpan ui-test [path] [opts]`                | Live UI test (Playwright + scenarios)                |
| `turpan runtime-test [path]`                  | Runtime review for Python bots / FastAPI / MCP       |
| `turpan fix [path] [opts]`                    | Generate (and optionally apply) safe fixes           |
| `turpan plugins list\|inspect <id>`           | Plugin management                                    |
| `turpan scenarios list\|inspect <id>`         | UI scenario management                               |
| `turpan scripts post-pr-comment [opts]`       | Post/update a sticky PR comment                      |
| `turpan mcp serve\|config\|status`            | MCP server subcommands                               |

## `turpan review`

The flagship command. Runs the full review pipeline on the given path.

```bash
turpan review .                       # standard review
turpan review . --deep                # include static-quality, security, dead code
turpan review . --quality             # code-quality only (skips build/test/lint/typecheck)
turpan review . --ui                  # include live UI tests
turpan review . --fix                 # produce patch plans (does not apply)
turpan review . --patch-only          # same as --fix
turpan review . --apply               # apply safe fixes (requires --fix or --auto-safe)
turpan review . --auto-safe           # apply only safe categories automatically
turpan review . --interactive         # ask before applying each fix
turpan review . --plan                # print the planned stages, don't run them
turpan review . --install             # run package install before review
turpan review . --plugins next,saas   # enable specific plugins
turpan review . --scenarios auth,billing  # run specific UI scenarios
turpan review . --skip-scenarios      # skip the scenario library entirely
turpan review . --skip-build          # don't run the build stage
turpan review . --skip-tests          # don't run the test stage
turpan review . --skip-lint           # don't run the lint stage
turpan review . --skip-typecheck      # don't run the typecheck stage
turpan review . --timeout 120         # per-command timeout in seconds
turpan review . --task ./task.md      # path to a task file (for agent-output audit)
turpan review . --agent-output        # run the agent output audit stage
turpan review . --dependency-audit     # include dependency CVE scan + license audit
turpan review . --dependency-audit --online  # same, but with live CVE data (OSV/npm audit)

### Diff-based review (`--from` / `--to`)

Run a review scoped to only the changes between two refs — ideal for PRs:

```bash
turpan review . --from main --to HEAD        # diff review of current branch vs main
turpan review . --from origin/main --to my-feature  # specific branches
turpan review . --from main --to HEAD --deep  # deep diff analysis
turpan review . --from main --to HEAD --fail-on critical  # block merge on critical findings
```

This produces all standard artifacts plus `TURPAN_PR_COMMENT.md` (GitHub PR comment draft) and `TURPAN_DIFF_FINDINGS.json` (CI-friendly JSON).

### `--fail-on <level>`

Controls exit code behavior for CI enforcement:

| Level | Exit 1 when |
|-------|-------------|
| `never` | Never fail (default) |
| `critical` | ≥1 critical finding |
| `high` | ≥1 critical **or** high finding |

```bash
turpan review . --from main --to HEAD --fail-on critical   # fail on critical
turpan review . --from main --to HEAD --fail-on high       # fail on critical or high
turpan review . --from main --to HEAD --fail-on never      # never fail (default)
```

### `turpan review-diff`

Dedicated diff-review command with explicit `--base` and `--target` flags:

```bash
turpan review-diff . --base main --target HEAD
turpan review-diff . --base v1.0.0 --target v1.1.0 --deep
turpan review-diff . --base main --target HEAD --fail-on high
```

### `turpan scripts post-pr-comment`

Post or update a sticky PR comment with Turpan review results:

```bash
turpan scripts post-pr-comment --run-path .turpan/runs/latest --pr-number 42
turpan scripts post-pr-comment --run-path .turpan/runs/latest --pr-number 42 --dry-run
turpan scripts post-pr-comment --run-path .turpan/runs/latest --pr-number 42 --update=false
```

Requires `GITHUB_TOKEN` env var or `--token` flag. The `--dry-run` flag prints the comment without posting.

### `turpan dependency-audit`

Standalone dependency security audit. Scans `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `requirements.txt`, and `pyproject.toml` for known vulnerabilities and license issues.

```bash
turpan dependency-audit .                       # offline scan (default)
turpan dependency-audit . --online              # OSV API + npm audit
turpan dependency-audit . --json                # JSON output
turpan dependency-audit . --fail-on-critical   # exit 1 on critical vulnerabilities
```

Produced files (written to `.turpan/runs/<runId>/` when run via `--dependency-audit`):
- `sbom.json` — internal SBOM
- `sbom.cdx.json` — CycloneDX 1.4 JSON SBOM

### What gets produced

A successful review creates:

```
.turpan/runs/<timestamp>/
├── TURPAN_ANALYSIS.md     # human-readable Markdown report
├── TURPAN_ANALYSIS.html   # browser-friendly HTML report
├── TURPAN_FINDINGS.json   # structured findings
├── TURPAN_SCORECARD.json  # scorecard
├── TURPAN_RUN_SUMMARY.json # compact summary (for MCP consumers)
├── TURPAN_EVIDENCE_INDEX.md # links to every evidence file
├── TURPAN_FIX_PLAN.md     # only when --fix or --apply is set
├── TURPAN_PATCH.diff      # only when --fix is set
├── sbom.json              # dependency SBOM (with --dependency-audit)
├── sbom.cdx.json          # CycloneDX SBOM (with --dependency-audit)
└── logs/turpan.log        # full execution log
```

A `latest` symlink points to the most recent run.

## `turpan report`

View, export, or open the most recent report.

```bash
turpan report                       # print markdown to stdout
turpan report --format html         # print HTML to stdout
turpan report --json                # print TURPAN_FINDINGS.json
turpan report --open                # open the HTML report in your browser
turpan report open                  # same as --open
```

## `turpan init`

```bash
turpan init                         # create turpan.yml in cwd
turpan init ./path/to/project       # create turpan.yml in a different path
```

Generates a starter `turpan.yml` with all sections (project, commands, ui, fix,
security, plugins, ignore). Safe to run multiple times — existing values are kept.

## `turpan inspect`

```bash
turpan inspect .                    # human-readable summary
turpan inspect . --json             # raw JSON
```

Prints the detected project fingerprint (languages, package manager, frameworks,
scripts, env files, etc.) without running any analyzers.

## `turpan doctor`

```bash
turpan doctor
```

Checks:
- Node.js ≥ 20
- `pnpm` on PATH
- Current directory is writable
- Reports any failures with a non-zero exit code

## `turpan plugins`

```bash
turpan plugins list                 # list plugins loaded for the current project
turpan plugins list --all           # list every built-in plugin
turpan plugins inspect <id>         # detailed info on one plugin
turpan plugins inspect <id> --json # raw JSON
```

## `turpan scenarios`

```bash
turpan scenarios list                # list available UI test scenarios
turpan scenarios inspect auth        # show what the auth scenario does
turpan scenarios test-auth           # show authenticated SaaS test status (Phase 27)
turpan scenarios test-auth --json    # same, machine-readable
turpan scenarios test-auth --project /path/to/repo
```

### `turpan scenarios test-auth` (Phase 27)

Reports the configured `ui.testUser` and `ui.billing` settings and lists all
authenticated SaaS scenarios. Password is **never** persisted or printed.

```bash
$ turpan scenarios test-auth
🔐 Turpan Authenticated SaaS Test Status

  Project: /home/user/my-saas-app
  testUser: DRY-RUN (default)
    email:          turpan-test@example.com
    loginPath:      /login
    dashboardPath:  /dashboard
    seedCommand:    (none)
    passwordStored: false (NEVER persisted)

  billing: DISABLED (default)
    checkoutEndpoint: 

  Authenticated scenarios:
    next-saas-auth-good                           Risk: low
    next-saas-billing-test-mode                   Risk: low
    next-saas-dashboard-empty                     Risk: safe
    next-saas-settings-noop-save                  Risk: safe
    next-saas-admin-unprotected-authenticated     Risk: medium

  To enable real authenticated scenario runs:
    1. Set ui.testUser.enabled: true in turpan.yml
    2. Provide a TEST account (NEVER real user credentials)
    3. Optionally provide a seedCommand to prepare the test user

  See docs/UI_TESTING.md for full configuration and safety properties.
```

Set `ui.testUser.enabled: true` in `turpan.yml` to switch to real authenticated mode.

## `turpan mcp`

Starts the Model Context Protocol server so AI agents can call Turpan as a tool.

```bash
turpan mcp serve                    # start the server on stdio
turpan mcp serve --workspace ./proj # scope the server to one project
turpan mcp config                   # print MCP config JSON
turpan mcp status                   # show status
```

See **[MCP Server](./MCP_SERVER.md)** for the full guide.

## Exit codes

| Code | Meaning                                                       |
|------|---------------------------------------------------------------|
| 0    | Success — review completed with no `--fail-on` policy violation |
| 1    | Doctor check failed, fix engine rejected all, or `--fail-on` policy triggered |
| 2    | Invalid arguments                                             |
| 130  | SIGINT — interrupted by Ctrl-C                                 |
| 143  | SIGTERM — terminated externally                               |

> When using `--fail-on`, exit code 1 means the policy threshold was met (critical and/or high findings present). Exit code 1 due to analysis errors (network failures, etc.) is independent of `--fail-on` — those always exit non-zero.

## Environment variables

| Variable           | Effect                                            |
|--------------------|---------------------------------------------------|
| `TURPAN_NO_COLOR`  | Disable color output                              |
| `TURPAN_LOG_LEVEL` | Override the log level (`debug`/`info`/`warn`/`error`) |
| `NO_COLOR`         | Standard no-color flag                            |
