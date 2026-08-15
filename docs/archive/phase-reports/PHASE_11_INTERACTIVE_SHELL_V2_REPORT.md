# PHASE 11 — Interactive Shell V2

## Summary

Built a clean, modular interactive shell for Turpan that maps natural language commands to review/fix workflows deterministically — no LLM required. The shell is terminal-friendly, read-safe by default, and ready for optional LLM routing in the future.

---

## Files Changed

| File | Change |
|---|---|
| `apps/cli/src/shell/InteractiveShell.ts` | New — main shell orchestration |
| `apps/cli/src/shell/IntentRouter.ts` | New — intent-to-workflow routing |
| `apps/cli/src/shell/CommandMemory.ts` | New — session memory |
| `apps/cli/src/shell/ShellRenderer.ts` | New — terminal rendering |
| `apps/cli/src/shell/ShellSession.ts` | New — session state |
| `apps/cli/src/shell/intent.ts` | Expanded — all NL intents |
| `apps/cli/src/shell/index.ts` | Updated exports |
| `apps/cli/src/index.ts` | Delegates to new shell module |
| `packages/shared/src/types/index.ts` | Added 15 new intent types |

### Test Files Added

| File | Tests |
|---|---|
| `apps/cli/src/shell/intent.test.ts` | 38 intent parsing tests |
| `apps/cli/src/shell/safety.test.ts` | 19 safety behavior tests |
| `apps/cli/src/shell/CommandMemory.test.ts` | 23 memory/navigation tests |

---

## Architecture

### Shell Components

```
InteractiveShell.ts     — Main loop: prompt → parse → route → execute → display
  IntentRouter.ts        — Maps Intent enum to RouterResult (run/patch/apply/report/skip)
  CommandMemory.ts       — Persists: runId, findings, scorecard, history, mode, state
  ShellRenderer.ts       — All terminal output: stages, summaries, findings, scorecard
  ShellSession.ts        — Session state + history navigation + mode helpers
```

### Intent System

28 intents total, routed deterministically by phrase matching:

| Intent | Action | Description |
|---|---|---|
| `deep_review` | run | Comprehensive multi-stage review |
| `quick_review` | run | Fast: typecheck + lint only |
| `ui_review` | run | Visual/UI analysis |
| `runtime_review` | run | Runtime behavior analysis |
| `code_quality_review` | run | Static quality + complexity |
| `cleanup_review` | report | Dead code scan (never deletes) |
| `security_review` | run | Security vulnerability scan |
| `agent_output_audit` | run | AI agent output quality audit |
| `fix_safe` | patch | Fix only auto-fixable issues |
| `patch_only` | patch | Propose fixes without applying |
| `apply_fix` | apply | Apply fixes to codebase |
| `fix` | patch | Default: safe fixes (patch-only) |
| `generate_report` | report | Generate analysis report |
| `open_report` | open | Open latest report in browser |
| `show_findings` | report | Show findings from last run |
| `show_scorecard` | report | Show scorecard from last run |
| `exit` | skip | Exit shell |

### Slash Commands

`/help`, `/status`, `/findings`, `/score`, `/report`, `/review`, `/review --ui`, `/fix --patch-only`, `/fix --apply`, `/doctor`, `/exit`

### Command Memory

- Last run ID + metadata
- Last findings + scorecard
- Command history (newest-first, capped 100)
- Selected mode tracking
- Project started state

---

## Safety Behavior

| Command | Behavior |
|---|---|
| `clean unused code` | Reports only — never deletes |
| `remove unused code` | Reports only — never deletes |
| `fix` | Patch-only by default — no files modified |
| `fix --apply` | Explicit flag required to apply changes |
| `improve code quality` | Patch-only (not destructive) |
| Ambiguous commands | Routes to `report` action (safest) |

---

## Validation

| Check | Command | Result |
|---|---|---|
| TypeScript compile | `pnpm run build` | PASS |
| Intent tests | `vitest run src/shell/intent.test.ts` | 38/38 PASS |
| Safety tests | `vitest run src/shell/safety.test.ts` | 19/19 PASS |
| Memory tests | `vitest run src/shell/CommandMemory.test.ts` | 23/23 PASS |
| All tests | `pnpm test` | **80/80 PASS** |

---

## Next Steps

- Add `/open` slash command to open the latest HTML report
- Integrate `openReport()` from `@turpan/report` into shell flow
- Consider adding command completion hints (readline tab-complete)
- Add optional LLM routing layer behind deterministic matching for ambiguous commands