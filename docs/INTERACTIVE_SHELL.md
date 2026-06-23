# Interactive Shell

The Turpan interactive shell lets you drive the review pipeline with natural
language. It parses your intent, routes it to the right command, and remembers
your last run's findings and scorecard.

## Opening the shell

```bash
turpan
```

You'll see a header, your project fingerprint, and the available command
categories:

```
🐪 Turpan — Interactive Review Agent

📋 Project Summary
────────────────────
  Project: my-saas
  Type: nextjs
  Languages: TypeScript
  Package Manager: pnpm
  Scripts: build: next build | dev: next dev | test: vitest run

Commands: review | test | ui | clean | fix | report | doctor | exit
Type a command or /help for available commands.

turpan >
```

## Natural-language commands

The shell maps free-form text to intents:

| You type                              | Intent                  |
|---------------------------------------|-------------------------|
| `analyze this project`                | analyze                 |
| `analyze this project deeply`         | deep_review             |
| `quick review`                        | quick_review            |
| `review this as a SaaS`               | review + plugin `saas`  |
| `review this as a Python bot`         | review + plugin `python`|
| `review this as an MCP server`        | review + plugin `mcp`   |
| `review with Next plugin`             | review + plugin `next`  |
| `run unit tests`                      | test                    |
| `run live UI test`                    | ui                      |
| `test the auth scenario`              | ui + scenario `auth`    |
| `test the billing page`               | ui + scenario `billing` |
| `check responsive design`             | ui + scenario `responsive`|
| `clean unused code`                   | cleanup                 |
| `find fake implementations`           | cleanup                 |
| `fix safe issues`                     | patch-only              |
| `apply safe fixes`                    | apply                   |
| `generate Turpan Analysis`            | report                  |
| `open report`                         | report (open)           |
| `show findings`                       | show findings           |
| `show scorecard`                      | show scorecard          |

The matcher is fuzzy and case-insensitive. Both `review this` and `analyze this`
trigger a standard review.

## Slash commands

Slash commands are stable, short, and easy to type:

| Slash command           | Effect                                  |
|-------------------------|-----------------------------------------|
| `/help`                 | Show available commands                 |
| `/status`               | Show last run summary                   |
| `/findings`             | Show findings from last run             |
| `/score` / `/scorecard` | Show scorecard from last run            |
| `/report`               | Open the HTML report                    |
| `/review`               | Trigger a review                        |
| `/review --ui`          | Trigger a UI review                     |
| `/fix --patch-only`     | Generate patches (no apply)             |
| `/fix --apply`          | Generate and apply patches              |
| `/doctor`               | Run environment checks                  |
| `/exit` / `/quit`       | Exit the shell                          |

## Plugin-driven commands

You can also target a specific project type:

```text
turpan > review this as a SaaS
turpan > analyze this project deeply with Next plugin
turpan > use security plugin for this project
```

This sets the active plugin set for the run; the analyzer registry loads the
relevant rules and scenarios.

## Scenario commands

UI scenarios can be selected by name:

```text
turpan > test the auth flow
turpan > check the billing page
turpan > run responsive design tests
turpan > test dashboard + admin
```

Each scenario focuses on one product area (auth, billing, dashboard, navigation,
admin, responsive layout, marketing). The shell resolves the names to scenario
IDs and passes them through to the UI runner.

## Memory

The shell keeps state between commands:

- **Last run ID** — used for `/findings`, `/score`, `/report`
- **Last findings** — printed after each review
- **Last scorecard** — used by `/score`
- **Last mode** — `quality`, `ui`, `deep`, etc.

Use `/status` to inspect the memory:

```text
turpan > /status

  Mode:     deep
  Last run: run-2026-06-20-xyz
  Findings: 12 (2 critical, 3 high, 7 medium)
```

## Tips

- **Chain commands** — after a review, type `show critical` to filter.
- **Use arrow keys** — inquirer preserves history; press ↑/↓ to navigate.
- **Empty input is a no-op** — just press Enter to do nothing.
- **Ctrl-C exits cleanly** — inquirer handles SIGINT gracefully.

## Safety

- **No destructive fixes by default.** All `fix` and `apply` commands prompt
  before writing to your repo.
- **No real credentials.** All test scenarios use `turpan-test@example.com` /
  `TurpanTest123!` and never submit a real payment.
- **All output is redacted.** API keys, tokens, and passwords in logs are
  replaced with `[REDACTED]`.

## Next steps

- **[Fix Engine](./FIX_ENGINE.md)** — what happens when you say "fix safe issues".
- **[UI Testing](./UI_TESTING.md)** — what the scenarios actually do.
- **[Real Scenarios](./REAL_SCENARIOS.md)** — concrete examples end-to-end.
