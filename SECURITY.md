# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in Turpan, please report it via
[GitHub Issues](https://github.com/) with the label `security` or by contacting
the maintainers directly.

**Please do not disclose security vulnerabilities publicly until a fix is
available.**

## Security Model

Turpan is designed with the following security properties:

### Read-only by Default
Turpan never modifies your code unless you explicitly request fixes via
`--apply` or `--auto-safe` and confirm each change.

### No Shell Injection
Build, test, and lint commands are executed with `shell: false` and strict
argv parsing — no eval, no string interpolation into shell commands.

### Secret Redaction
All hardcoded secrets detected in code are redacted in reports, logs, and MCP
outputs. Only a pattern match and confidence score are shown.

### MCP Path Traversal Blocking
The MCP server uses Zod schemas to reject any path traversal attempt
(`../`, absolute paths outside workspace) at the schema validation layer.

### Workspace Allowlist
The MCP server only operates within explicitly allowed workspace roots.
You must pass `--workspace` to grant access to a specific directory.

### Destructive UI Actions Forbidden
Playwright-based UI tests explicitly forbid clicking buttons that contain
`delete`, `drop`, `purge`, or similar destructive terms.

### Plugin Isolation
Plugin code must be explicitly listed in `turpan.yml` and runs in-process.
Untrusted plugins can exfiltrate data — only use plugins from sources you trust.

## Known Limitations

- **Plugins run in-process** — plugin code you add to `turpan.yml` has the same
  permissions as the Turpan process. Only use plugins from sources you trust.
- **Browser spawning** — UI tests launch a real Chromium browser. Turpan kills
  it on exit, but ensure your sandbox settings allow this for local development.
- **No production-grade security audit** — Turpan v0.1.0 has not undergone a
  formal security review. Treat it as a developer tool, not a security product.

## Security Updates

Security updates will be released as patch versions (0.1.1, 0.1.2, etc.)
and announced via the project's release notes.