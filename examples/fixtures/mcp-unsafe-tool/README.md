# mcp-unsafe-tool

A Model Context Protocol (MCP) server that registers a `run_command` tool which executes arbitrary shell commands.

## Issues intentionally planted

- Tool accepts any `command` string and runs it via `child_process.exec`
- No allowlist, no path validation, no timeout, no audit logging
- The tool description itself admits "arbitrary shell command"

## Expected eval result

- Verdict: NO_GO
- At least 1 critical finding in category `security` (or `runtime`/`mcp`)
- A finding referencing the unsafe tool registration
