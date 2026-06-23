# Fix Engine

The Fix Engine is Turpan's safe-by-default patch generator. It reads the
findings from a review and produces **small, reviewable, reversible** patches
that you (or the shell, with your permission) can apply.

## Why a "safe" fix engine?

Most code-fix tools are unsafe in one of two ways:

1. They propose sweeping changes that touch dozens of files at once.
2. They apply changes without giving you a way to undo them.

Turpan's Fix Engine is bounded by design:

- **Per-fix file count is capped** (default: 5 files per fix).
- **Per-fix change is small** (a single concern, clearly described).
- **No destructive changes by default** — deletes and dependency changes
  require explicit opt-in.
- **No auto-apply without confirmation** — even in `auto-safe` mode, the fix
  is still a patch you can read before it lands.
- **Rollback is always possible** — every applied fix records the previous
  git commit so `git reset` works.

## Modes

| Mode          | What it does                                                 |
|---------------|--------------------------------------------------------------|
| `report-only` | Produces a fix plan (`TURPAN_FIX_PLAN.md`) but no patch file  |
| `patch-only`  | Produces the plan AND `TURPAN_PATCH.diff` but doesn't apply  |
| `auto-safe`   | Applies only "safe" categories automatically                  |
| `apply`       | Applies all eligible fixes                                    |
| `interactive` | Asks before each fix                                          |

`report-only` is the default and **never modifies your code**. Use it first
to see what the engine would do.

## Configuration

In `turpan.yml`:

```yaml
fix:
  mode: report-only        # report-only | patch-only | auto-safe | apply
  maxFilesChanged: 5       # hard cap on files per fix
  allowDependencyChanges: false  # include dependency updates
  allowFileDeletion: false       # include file deletes
```

Equivalent CLI flags:

```bash
turpan fix . --patch-only      # generates TURPAN_PATCH.diff
turpan fix . --apply           # generates + applies
turpan fix . --auto-safe       # applies only safe categories
turpan fix . --interactive     # ask before each fix
```

## The fix lifecycle

```
   review (creates findings)
        │
        ▼
   fix plan (TURPAN_FIX_PLAN.md)         ← report-only mode stops here
        │
        ▼
   patch (TURPAN_PATCH.diff)             ← patch-only mode stops here
        │
        ▼
   apply (writes to working tree)       ← apply / auto-safe / interactive
        │
        ▼
   rollback (git reset)                 ← if anything goes wrong
```

Each step is **idempotent and reviewable** — you can stop at any step and
inspect what the engine would do next.

## Fix categories

The Fix Engine only handles categories marked as `auto` fixable in the
finding. Categories typically classified as `auto`:

- `dependency` — remove an unused dep from `package.json` / `requirements.txt`
- `placeholder` — replace a known placeholder pattern with a TODO comment
- `dead-code` — remove an exported symbol with no usages (after full AST scan)
- `lint-formatting` — apply trivial formatting fixes

Categories typically classified as `manual` (require human review):

- `security` — auth, secrets, XSS, CORS
- `architecture` — refactor module boundaries
- `agent-output` — replace fake implementations with real ones
- `api-design` — rename public APIs
- `runtime` — fix async/concurrency bugs

Manual categories are listed in `TURPAN_FIX_PLAN.md` but never auto-applied.

## What `turpan fix` produces

```
.turpan/runs/<runId>/
├── TURPAN_FIX_PLAN.md     # markdown table of every candidate fix
├── TURPAN_PATCH.diff      # unified diff of the proposed changes
└── (after apply)
    └── TURPAN_APPLY.json  # record of what was applied, with rollback info
```

## Example fix plan

```
## Fix Candidates

### ✅ Safe to apply automatically

| Category     | File             | Description                                |
|--------------|------------------|--------------------------------------------|
| dependency   | package.json     | Remove unused dep `lodash.debounce`        |
| placeholder  | src/api/foo.ts   | Replace `console.log("TODO")` with comment |

### ⚠️ Requires manual review

| Category     | File             | Description                                |
|--------------|------------------|--------------------------------------------|
| security     | src/api/auth.ts  | Add auth check to /api/admin/users route   |
| architecture | src/db/index.ts  | Split persistence from query layer         |

### ❌ Rejected by policy

| Category     | File             | Reason                          |
|--------------|------------------|----------------------------------|
| dependency   | package.json     | Would require running npm/yarn  |
```

## Safety properties

- **The patch is a unified diff.** You can `git apply` it manually, send it
  in a PR, or stash it for later.
- **No shell evaluation.** Patches are text — they don't run any code.
- **No network calls.** The fix engine doesn't talk to package registries.
- **No writes outside the working tree.** No git history rewrites, no
  force-pushes, no global config changes.

## When to use what

- **First time on a project?** Use `report-only`, read `TURPAN_FIX_PLAN.md`,
  decide which fixes are real. Then move to `patch-only`.
- **CI?** Use `patch-only` and post `TURPAN_PATCH.diff` as a PR comment for
  review.
- **Local cleanup?** Use `apply` after confirming the patch contents.
- **Hard rule "no edits"?** Stay on `report-only` forever. The patch is still
  generated for documentation.

## Rolling back

After an `apply`:

```bash
git diff                 # see what changed
git checkout -- .        # discard all changes
git reset --hard HEAD~1  # if it was committed
```

Every fix records its pre-state in `.turpan/runs/<runId>/TURPAN_APPLY.json`,
which includes:

- The exact files modified
- The pre-image of each file
- The exact diff applied
- The git HEAD before the change
