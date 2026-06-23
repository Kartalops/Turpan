#!/usr/bin/env bash
# entrypoint.sh — GitHub Action entry point for Turpan PR Review
#
# Inputs (via env vars):
#   TURPAN_PROJECT_PATH       — project path (default: '.')
#   TURPAN_BASE_REF           — base ref (default: main)
#   TURPAN_HEAD_REF           — head ref (default: HEAD)
#   TURPAN_REVIEW_MODE        — quick | deep (default: quick)
#   TURPAN_UI_ENABLED         — true | false (default: false)
#   TURPAN_DEP_AUDIT_ENABLED  — true | false (default: false)
#   TURPAN_FAIL_ON            — critical | high | never (default: never)
#   TURPAN_POST_COMMENT       — true | false (default: false)
#   TURPAN_UPDATE_COMMENT     — true | false (default: true)
#   TURPAN_VERSION            — version or dist-tag (default: latest)
#   GITHUB_TOKEN              — GitHub token (only needed if TURPAN_POST_COMMENT=true)
#
# Outputs (via GITHUB_OUTPUT):
#   verdict, score, critical-count, high-count, artifacts-url

set -euo pipefail

# ── Resolve project root ────────────────────────────────────────────────────
PROJECT_PATH="${TURPAN_PROJECT_PATH:-.}"
cd "$PROJECT_PATH" || exit 1

# ── Resolve Turpan binary ───────────────────────────────────────────────────
install_turpan() {
  local version="${TURPAN_VERSION:-latest}"
  if command -v turpan &>/dev/null; then
    echo "::notice::Using existing turpan installation"
    return 0
  fi
  echo "::notice::Installing Turpan@${version}"
  if command -v npx &>/dev/null; then
    npx --yes @turpan/cli@"$version" --version || true
  else
    echo "::error::npx not found — cannot install Turpan"
    exit 1
  fi
}

# Try to use local first, then install if needed
if [[ -f "./node_modules/.bin/turpan" ]]; then
  TURPAN_BIN="./node_modules/.bin/turpan"
elif command -v turpan &>/dev/null; then
  TURPAN_BIN="turpan"
else
  install_turpan
  TURPAN_BIN="npx --yes @turpan/cli@${TURPAN_VERSION:-latest}"
fi

echo "::notice::Using Turpan: $TURPAN_BIN"

# ── Parse inputs ────────────────────────────────────────────────────────────
BASE_REF="${TURPAN_BASE_REF:-main}"
HEAD_REF="${TURPAN_HEAD_REF:-HEAD}"
REVIEW_MODE="${TURPAN_REVIEW_MODE:-quick}"
UI_ENABLED="${TURPAN_UI_ENABLED:-false}"
DEP_AUDIT_ENABLED="${TURPAN_DEP_AUDIT_ENABLED:-false}"
FAIL_ON="${TURPAN_FAIL_ON:-never}"
POST_COMMENT="${TURPAN_POST_COMMENT:-false}"
UPDATE_COMMENT="${TURPAN_UPDATE_COMMENT:-true}"

# ── Build turpan command ─────────────────────────────────────────────────────
TURPAN_CMD="$TURPAN_BIN review . --from $BASE_REF --to $HEAD_REF --fail-on $FAIL_ON"

if [[ "$REVIEW_MODE" == "deep" ]]; then
  TURPAN_CMD="$TURPAN_CMD --deep"
fi

if [[ "$UI_ENABLED" == "true" ]]; then
  TURPAN_CMD="$TURPAN_CMD --ui"
fi

if [[ "$DEP_AUDIT_ENABLED" == "true" ]]; then
  TURPAN_CMD="$TURPAN_CMD --plugins dependency-audit"
fi

echo "::notice::Running: $TURPAN_CMD"

# ── Run review ───────────────────────────────────────────────────────────────
REVIEW_START=$(date +%s)
set +e
eval "$TURPAN_CMD"
TURPAN_EXIT=$?
set -e
REVIEW_END=$(date +%s)
REVIEW_DURATION=$((REVIEW_END - REVIEW_START))

echo "::notice::Turpan exit code: $TURPAN_EXIT, duration: ${REVIEW_DURATION}s"

# ── Locate run artifacts ─────────────────────────────────────────────────────
# Find the latest run directory
if [[ -d ".turpan/runs/latest" ]]; then
  RUN_PATH="$(cd .turpan/runs/latest && pwd)"
elif [[ -d ".turpan/runs" ]]; then
  RUN_PATH="$(ls -t .turpan/runs/ | head -1 | xargs -I{} echo ".turpan/runs/{}")"
  RUN_PATH="$(cd "$RUN_PATH" && pwd)"
else
  RUN_PATH=""
fi

# ── Parse findings JSON ───────────────────────────────────────────────────────
VERDICT="unknown"
SCORE="0"
CRITICAL_COUNT="0"
HIGH_COUNT="0"

if [[ -n "$RUN_PATH" && -f "$RUN_PATH/TURPAN_FINDINGS.json" ]]; then
  # Extract verdict
  VERDICT=$(grep -o '"verdict"[[:space:]]*:[[:space:]]*"[^"]*"' "$RUN_PATH/TURPAN_FINDINGS.json" 2>/dev/null | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
  if [[ -z "$VERDICT" ]]; then VERDICT="unknown"; fi

  # Extract score
  SCORE=$(grep -o '"overall"[[:space:]]*:[[:space:]]*[0-9]*' "$RUN_PATH/TURPAN_SCORECARD.json" 2>/dev/null | head -1 | grep -o '[0-9]*' || echo "0")
  if [[ -z "$SCORE" ]]; then SCORE="0"; fi

  # Count severities
  CRITICAL_COUNT=$(grep -o '"severity"[[:space:]]*:[[:space:]]*"critical"' "$RUN_PATH/TURPAN_FINDINGS.json" 2>/dev/null | wc -l | tr -d ' ')
  HIGH_COUNT=$(grep -o '"severity"[[:space:]]*:[[:space:]]*"high"' "$RUN_PATH/TURPAN_FINDINGS.json" 2>/dev/null | wc -l | tr -d ' ')
fi

echo "VERDICT=$VERDICT" >> "$GITHUB_OUTPUT"
echo "SCORE=$SCORE" >> "$GITHUB_OUTPUT"
echo "CRITICAL_COUNT=$CRITICAL_COUNT" >> "$GITHUB_OUTPUT"
echo "HIGH_COUNT=$HIGH_COUNT" >> "$GITHUB_OUTPUT"

# ── Upload artifacts ─────────────────────────────────────────────────────────
ARTIFACTS_URL=""
if [[ -n "$RUN_PATH" ]]; then
  echo "::notice::Uploading artifacts from $RUN_PATH"
  # Artifact upload is handled by the calling workflow using actions/upload-artifact
  # We set the path so the workflow can reference it
  echo "ARTIFACTS_PATH=$RUN_PATH" >> "$GITHUB_OUTPUT"
fi

# ── Post PR comment ──────────────────────────────────────────────────────────
if [[ "$POST_COMMENT" == "true" && -n "$GITHUB_TOKEN" && -f "$RUN_PATH/TURPAN_PR_COMMENT.md" ]]; then
  echo "::notice::Posting PR comment"
  if command -v npx &>/dev/null; then
    npx --yes @turpan/cli@${TURPAN_VERSION:-latest} scripts post-pr-comment \
      --run-path "$RUN_PATH" \
      --token "$GITHUB_TOKEN" \
      --update="$UPDATE_COMMENT" \
      2>&1 || echo "::warning::PR comment posting failed (non-fatal)"
  fi
fi

# ── Write GitHub step summary ─────────────────────────────────────────────────
if [[ -n "$RUN_PATH" && -f "$RUN_PATH/TURPAN_PR_COMMENT.md" ]]; then
  {
    echo '## 🐪 Turpan PR Review'
    echo ''
    echo "| | |"
    echo "|-|-:|"
    echo "| **Verdict** | $VERDICT |"
    echo "| **Score** | $SCORE/100 |"
    echo "| **Critical** | $CRITICAL_COUNT |"
    echo "| **High** | $HIGH_COUNT |"
    echo "| **Duration** | ${REVIEW_DURATION}s |"
    echo ''
    echo '---'
    echo ''
    echo '### 📊 Full Report'
    echo ''
    echo "Results are available in the **artifacts** below:"
    echo '- `TURPAN_ANALYSIS.md` — Full analysis report'
    echo '- `TURPAN_PR_COMMENT.md` — GitHub PR comment (copy and paste manually)'
    echo '- `TURPAN_DIFF_FINDINGS.json` — CI-friendly JSON'
    echo '- `TURPAN_FINDINGS.json` — All findings'
    echo ''
    echo '---'
    echo "*🤖 Generated by [Turpan](https://github.com/turpan/turpan)*"
  } >> "$GITHUB_STEP_SUMMARY"
fi

# ── Final exit code ──────────────────────────────────────────────────────────
# If Turpan itself exited non-zero, propagate that (analysis error, not just findings)
if [[ "$TURPAN_EXIT" -ne 0 ]]; then
  echo "::error::Turpan exited with code $TURPAN_EXIT"
  exit "$TURPAN_EXIT"
fi

echo "::notice::Review complete — verdict: $VERDICT, score: $SCORE, critical: $CRITICAL_COUNT, high: $HIGH_COUNT"
exit 0