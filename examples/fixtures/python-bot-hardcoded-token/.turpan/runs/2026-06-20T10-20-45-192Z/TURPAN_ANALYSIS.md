# Turpan Analysis

## Verdict

❌ **NO_GO**

## Executive Summary

- ❌ **NO_GO** — project has 1 critical findings that must be resolved before release
- Overall score: **94/100
- 🔴 1 critical finding requires immediate attention
- Build health: **94/100**
- Security posture: **80/100**
- Maintainability: **100/100**

## Project Fingerprint

| Property | Value |
|---------|-------|
| Project Name | unknown |
| App Type | unknown |
| Languages | unknown |
| Package Manager | unknown |
| UI Framework | unknown |
| Backend Framework | unknown |
| Test Tools | unknown |
| Commands | none detected |
| Routes | none detected |
| Runtime | Node.js |
| Report Version | 2026-06-20T10-20-45-192Z |

## Scorecard

| Dimension | Score |
|-----------|-------|
| **Overall** | **94/100** |
| Build Health       | 94/100 |
| Test Health        | 100/100 |
| Code Quality       | 100/100 |
| Security           | 80/100 |
| Performance        | 100/100 |

| Finding Severity | Count |
|-----------------|-------|
| 🔴 Critical | 1 |
| 🟠 High     | 0 |
| 🟡 Medium   | 0 |
| 🟢 Low      | 0 |
| 🔵 Info     | 1 |

## Critical Findings


### Hardcoded token in bot.py


Found 1 hardcoded secret pattern(s) in bot.py. Hardcoded secrets (API keys, tokens, passwords) in source code risk exposure via version control, logs, and bundle leaks. Move secrets to environment variables or a secrets manager (e.g. AWS Secrets Manager, Vault).

**Suggested Fix:**

Replace the hardcoded value with process.env.<NAME> or use a secrets manager. Rotate the exposed credential immediately.

**Evidence:**

- `Hardcoded secret`: [/home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/python-bot-hardcoded-token/bot.py](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/python-bot-hardcoded-token/bot.py) — TELEGRAM_BOT_[REDACTED]

## High Findings

_No high severity findings._
## Medium Findings

_No medium severity findings._
## Low Findings

_No low severity findings._
## Evidence Index

### Logs

- [logs/turpan.log](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/python-bot-hardcoded-token/.turpan/runs/2026-06-20T10-20-45-192Z/logs/turpan.log) (0.1 KB)

### JSON Files

- [TURPAN_FINDINGS.json](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/python-bot-hardcoded-token/.turpan/runs/2026-06-20T10-20-45-192Z/TURPAN_FINDINGS.json) (3.5 KB)
- [TURPAN_SCORECARD.json](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/python-bot-hardcoded-token/.turpan/runs/2026-06-20T10-20-45-192Z/TURPAN_SCORECARD.json) (0.2 KB)
