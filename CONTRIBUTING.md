# Contributing to Turpan

Thank you for your interest in contributing to Turpan!

## Development Setup

```bash
# Clone the repository
git clone <your-fork-url>
cd Turpan

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Run the eval suite
pnpm eval

# Type-check all packages
pnpm lint
```

## Project Structure

```
apps/
  cli/              # CLI entrypoint (turpan command)
  mcp-server/       # MCP server (turpan mcp serve)
packages/
  core/             # Orchestrator, fingerprint, analyzers, plugins, runner
  ui-runner/        # Playwright UI testing
  analyzers/        # Agent-output audit, completeness checks
  fix-engine/       # Safe fix engine (patches, rollback)
  report/           # Markdown/HTML/JSON report writers
  shared/           # Shared types, fs, git, process utils
```

## Adding a New Analyzer

1. Create the analyzer file in `packages/core/src/analyzers/` or `packages/analyzers/src/`.
2. Add tests (Vitest) alongside the source file.
3. Register the analyzer in the appropriate plugin or orchestrator stage.
4. Run `pnpm test` to confirm the new analyzer doesn't break anything.

## Adding a New Plugin

1. Create the plugin in `packages/core/src/plugins/` following the existing plugin interface.
2. Add plugin-specific test scenarios to `packages/core/tests/`.
3. Update `docs/PLUGINS.md` with the new plugin's name, trigger patterns, and capabilities.

## Adding an Eval Fixture

1. Create a directory under `examples/fixtures/`.
2. Add an `eval.json` file with assertions.
3. Run `pnpm eval --fixture <name>` to verify it works.

## Code Style

- TypeScript strict mode is enforced across all packages.
- Run `pnpm lint` before committing.
- Prefer explicit types over `any`.
- New code should include test coverage.

## Pull Request Process

1. Fork the repository and create a feature branch.
2. Make your changes with tests passing (`pnpm test`).
3. Ensure `pnpm lint` passes with no new errors.
4. Ensure `pnpm eval` still passes.
5. Update documentation if you changed user-facing behavior.
6. Open a pull request with a clear description of the change.

## Reporting Issues

Use the [GitHub Issues](https://github.com/) page. Please include:

- Turpan version (`npx turpan --version`)
- Node.js version
- Your operating system
- A minimal reproduction or the relevant portion of your `turpan.yml`

## License

By contributing, you agree that your contributions will be licensed under the project's license.