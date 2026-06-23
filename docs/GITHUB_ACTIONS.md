# GitHub Actions Integration

Turpan provides first-class GitHub Actions integration for PR review workflows. This enables automated code review as a CI check, with full artifact capture and optional PR comments.

---

## Quick Start

### 1. Copy the example workflow

```bash
cp .github/workflows/turpan-pr-review.yml.example .github/workflows/turpan-pr-review.yml
```

### 2. Commit

```bash
git add .github/workflows/turpan-pr-review.yml
git commit -m "feat(ci): add Turpan PR review workflow"
git push
```

### 3. Open a PR

Turpan will automatically run on every PR and post results as a PR check.

---

## Workflow Options

### Basic (no secrets required)

```yaml
name: Turpan PR Review
on:
  pull_request:
    types: [opened, synchronize, reopened]
    branches: [main]

jobs:
  turpan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Required for diff analysis

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile
      - run: pnpm build

      - name: Run Turpan
        run: |
          node apps/cli/dist/index.js review . \
            --from main \
            --to HEAD \
            --fail-on never
```

### With PR comment

```yaml
      - name: Post PR Comment
        if: always()
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          node apps/cli/dist/index.js scripts post-pr-comment \
            --run-path .turpan/runs/latest \
            --pr-number ${{ github.event.pull_request.number }} \
            --update=true
```

### Using the reusable action

```yaml
jobs:
  turpan:
    uses: ./.github/actions/turpan-review
    with:
      base-ref: main
      head-ref: HEAD
      review-mode: quick
      fail-on: never
      post-comment: false
```

---

## CLI Flags

### `--fail-on <level>`

Controls exit code behavior for CI enforcement:

| Level | Exit 1 when |
|-------|-------------|
| `never` | Never fail (default) |
| `critical` | ≥1 critical finding |
| `high` | ≥1 critical **or** high finding |

**Examples:**

```bash
# Block merge on critical findings only
turpan review . --from main --to HEAD --fail-on critical

# Block merge on critical or high findings
turpan review . --from main --to HEAD --fail-on high

# Report only, always exit 0
turpan review . --from main --to HEAD --fail-on never
```

### `--from <ref>` / `--to <ref>`

Set the base and head refs for diff-scoped review:

```bash
turpan review . --from origin/main --to HEAD
```

### `--deep`

Enable deep analysis (security, dead code, complexity checks):

```bash
turpan review . --from main --to HEAD --deep
```

---

## Artifacts

The following artifacts are produced by each run and uploaded automatically when using the example workflow:

| Artifact | Description |
|----------|-------------|
| `TURPAN_ANALYSIS.md` | Full analysis report |
| `TURPAN_PR_COMMENT.md` | GitHub PR comment draft (copy-paste ready) |
| `TURPAN_DIFF_FINDINGS.json` | CI-friendly JSON findings |
| `TURPAN_FINDINGS.json` | All findings with severity, category, file, line |
| `TURPAN_SCORECARD.json` | Scorecard with category scores |
| `TURPAN_RUN_SUMMARY.json` | Run metadata (duration, timestamp, verdict) |
| `TURPAN_EVIDENCE_INDEX.md` | Evidence index for findings |
| `logs/` | Analysis logs |
| `screenshots/` | UI screenshots (if `--ui` enabled) |

---

## GitHub Step Summary

The example workflow writes a summary table to the GitHub Actions run page:

```markdown
## 🐪 Turpan PR Review

| | |
|-|-:|
| **Verdict** | GO |
| **Score** | 85/100 |
| **Critical** | 0 |
| **High** | 2 |
```

This appears in the **Summary** tab of every GitHub Actions run.

---

## Exit Codes

| Exit | Meaning |
|------|---------|
| `0` | Review complete — no policy violation |
| `1` | Review complete — `--fail-on` policy triggered |

Exit code `1` is **not** returned for analysis errors (network failures, etc.). Those always exit non-zero regardless of `--fail-on`.

---

## PR Comment Format

The sticky PR comment includes:

- Merge decision banner (blocked / request changes / approve)
- Verdict badge and score
- Changed files summary
- Risk summary (critical/high risk files)
- Changed routes, APIs, components
- Top 5 introduced risks
- Test coverage status
- Reproduction commands
- Top findings

### Sticky Comment Marker

Comments posted by `turpan scripts post-pr-comment` include a marker that allows the script to find and update them on subsequent runs:

```
<!-- turpan-pr-review sticky comment -->
```

The script searches for this marker before posting, so it updates the same comment rather than creating a new one each time.

---

## Security Notes

### No secrets in comments

The `post-pr-comment` script runs a secret redaction pass before posting:

- Bearer tokens → `Bearer [REDACTED]`
- Long hex strings (API keys) → `[REDACTED_KEY]`
- Environment variable values in code blocks → `[REDACTED]`
- URLs with embedded credentials → `https://[REDACTED]@`
- Long base64 strings → `[REDACTED_SECRET]`

### Token handling

- Never pass `GITHUB_TOKEN` as a logged/input value
- The script uses it only for the API call
- In dry-run mode, no network calls are made

### Comment size

GitHub comments are capped at 65,536 characters. If the report exceeds this, the comment is truncated with a note pointing to the full report in artifacts.

---

## Reusable GitHub Action

Located at `.github/actions/turpan-review/`:

**Inputs:**

| Input | Default | Description |
|-------|---------|-------------|
| `project-path` | `.` | Project path |
| `base-ref` | `main` | Base ref for diff |
| `head-ref` | `HEAD` | Head ref for diff |
| `review-mode` | `quick` | `quick` or `deep` |
| `ui-enabled` | `false` | Enable UI analysis |
| `dep-audit-enabled` | `false` | Enable dependency audit |
| `fail-on` | `never` | `critical`, `high`, or `never` |
| `post-comment` | `false` | Post PR comment |
| `update-comment` | `true` | Update existing sticky comment |
| `turpan-version` | `latest` | Turpan version/dist-tag |

**Outputs:**

| Output | Description |
|--------|-------------|
| `verdict` | GO, CONDITIONAL_GO, NO_GO |
| `score` | Overall score 0-100 |
| `critical-count` | Number of critical findings |
| `high-count` | Number of high findings |
| `artifacts-url` | URL to uploaded artifacts |

---

## GitHub Actions CI Integration Pattern

```yaml
jobs:
  turpan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile
      - run: pnpm build

      - name: Run review
        run: |
          node apps/cli/dist/index.js review . \
            --from main \
            --to HEAD \
            --fail-on critical

      - name: Upload artifacts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: turpan-review-${{ github.run_id }}
          path: .turpan/runs/latest/
          retention-days: 14
```

---

## MCP Server Integration

The MCP server tool `turpan.review_diff` can also be used in GitHub Actions via the Turpan MCP server. See [MCP_SERVER.md](./MCP_SERVER.md) for setup.

---

## Troubleshooting

### "ref not found" error

Make sure you have `fetch-depth: 0` in the checkout step — shallow clones don't have enough history for diff analysis.

### No artifacts found

Ensure the project has run Turpan at least once and `.turpan/runs/` exists.

### PR comment not posting

- Check that `GITHUB_TOKEN` is available (it's automatically provided by GitHub Actions)
- Verify `GITHUB_REPOSITORY` and `PR_NUMBER` are set in the environment
- Run with `--dry-run` locally to validate the comment content