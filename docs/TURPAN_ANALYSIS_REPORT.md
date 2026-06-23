# Turpan Analysis Report

The Turpan Analysis is the human-readable report produced at the end of every
review. It is designed to be opened by a human reviewer and to be machine-readable
enough to drive downstream automation (PR comments, status checks, etc.).

## What's in the report

A complete Turpan Analysis has these sections, in order:

### 1. Header

```markdown
# Turpan Analysis Report

**Project:** /path/to/project
**Date:** 2026-06-20T10:00:00.000Z
**Duration:** 12.3s
```

### 2. Verdict

`GO`, `CONDITIONAL_GO`, `NO_GO`, or `INTERNAL_ONLY`.

- **GO** — no critical/high findings; safe to ship.
- **CONDITIONAL_GO** — only medium/low issues; ship with eyes open.
- **NO_GO** — at least one critical or many high findings; do not ship.
- **INTERNAL_ONLY** — useful for internal use but not ready for external users.

### 3. Scorecard

A 0–100 score across five dimensions plus an overall:

| Dimension      | Weight | What it measures                                     |
|----------------|--------|------------------------------------------------------|
| Overall        | —      | Aggregate of the below                               |
| Build Health   | high   | Whether build commands succeed                       |
| Test Health    | high   | Whether test commands succeed                        |
| Code Quality   | medium | Static analysis cleanliness                         |
| Security       | high   | Presence of secrets, XSS, SQLi, open CORS            |
| UI / Runtime   | medium | Console errors, network errors, hydration errors     |

### 4. Project Fingerprint

The same summary `turpan inspect` produces — languages, package manager,
frameworks, scripts, env files, test tools.

### 5. Review Plan

The list of stages that ran, with reasons. If a stage was skipped, the reason
appears here too.

### 6. Findings by Severity

For each severity level (critical → info), all findings grouped and listed
with:

- Title
- Category and file:line
- Suggested fix
- Confidence percentage
- A short evidence excerpt

### 7. Findings by Category

The same findings reorganized by category (`security`, `agent-output`,
`maintainability`, etc.). Use this section to see, for example, all five
"secret-related" findings in one place.

### 8. Code Quality & Cleanup

A digest of cleanup candidates with two clearly-labelled sub-sections:

- **Safe Cleanup Candidates** — likely safe to remove after a quick visual check.
- **Risky Cleanup Candidates** — require manual review before any change.

### 9. Evidence Index

A list of every evidence file referenced by any finding. Click any link to
jump to the source.

### 10. Next Actions

A short, prioritized to-do list at the very bottom — what to look at first.

## Output formats

The CLI produces three files:

- `TURPAN_ANALYSIS.md` — the human-readable report.
- `TURPAN_ANALYSIS.html` — same content rendered as a single HTML page with
  inline CSS. No external assets, safe to email or upload.
- `TURPAN_FINDINGS.json` — the structured JSON used by MCP consumers, CI
  pipelines, and other automation.

## Reading the scorecard

The scorecard is informational, not normative. A project can score 60/100 and
still be perfectly shippable if the issues are all `low` severity in
non-critical paths. Conversely, a project can score 95/100 and still be
**NO_GO** if there's a single critical security finding.

Always cross-reference the verdict (which is severity-driven) with the scorecard
(which is aggregate-driven). The verdict is the canonical "should I ship?"
signal.

## Generating a report from an existing run

```bash
# Re-generate from .turpan/runs/latest
turpan report

# Open the HTML in a browser
turpan report --open

# Print structured JSON
turpan report --json
```

## Reading the JSON

`TURPAN_FINDINGS.json` is the canonical structured output:

```json
{
  "version": "1.0.0",
  "runId": "run-2026-06-20-xyz",
  "timestamp": "2026-06-20T10:00:00.000Z",
  "duration": 12340,
  "projectPath": "/home/user/project",
  "verdict": "CONDITIONAL_GO",
  "total": 12,
  "breakdown": { "critical": 0, "high": 1, "medium": 3, "low": 7, "info": 1 },
  "findings": [
    {
      "id": "fnd-...",
      "title": "...",
      "severity": "high",
      "category": "security",
      "explanation": "...",
      "file": "src/api/auth.ts",
      "line": 42,
      "evidence": [{ "type": "code", "path": "...", "excerpt": "..." }],
      "suggestedFix": "...",
      "fixable": "manual",
      "confidence": 90,
      "tags": ["security", "auth"]
    }
  ],
  "scorecard": { ... },
  "fingerprint": { ... }
}
```

The shape is stable across minor versions. See `TURPAN_RUN_SUMMARY.json` for
the compact MCP-friendly variant.
