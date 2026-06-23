# Turpan Analysis

## Verdict

⚠️ **CONDITIONAL_GO**

## Executive Summary

- ⚠️ **CONDITIONAL_GO** — project has 2 high and 2 medium severity findings that should be addressed
- Overall score: **95/100
- 🟠 2 high severity findings should be addressed before release
- 🟡 2 medium severity findings planned for next sprint
- Build health: **95/100**
- Security posture: **84/100**
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
| Report Version | 2026-06-20T10-40-42-916Z |

## Scorecard

| Dimension | Score |
|-----------|-------|
| **Overall** | **95/100** |
| Build Health       | 95/100 |
| Test Health        | 100/100 |
| Code Quality       | 100/100 |
| Security           | 84/100 |
| Performance        | 100/100 |

| Finding Severity | Count |
|-----------------|-------|
| 🔴 Critical | 0 |
| 🟠 High     | 2 |
| 🟡 Medium   | 2 |
| 🟢 Low      | 0 |
| 🔵 Info     | 1 |

## Critical Findings

_No critical severity findings._
## High Findings


### FastAPI app import failed: main.py

**File:** `/home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/fastapi-open-cors/main.py`

The FastAPI app in "main.py" could not be imported.

**Suggested Fix:**

Fix the import error in "main.py".

**Evidence:**

- `import-command`: python -c "from main import app"
- `stderr`:   File "<string>", line 1
    'from
    ^
SyntaxError: unterminated string literal (detected at line 1)


### CORS configured with wildcard allow_origins

**File:** `/home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/fastapi-open-cors/main.py`

CORS is configured with allow_origins=["*"]. This allows any website to make authenticated requests.

**Suggested Fix:**

Use an explicit allowlist instead of *.

**Evidence:**

- `cors-wildcard`: allow_origins=["*"] detected

## Medium Findings


### No health/readiness route found


FastAPI app has no /health or /healthz route. Kubernetes/load balancers rely on health checks.

**Suggested Fix:**

Add a health route: @app.get("/health") def health(): return {"status": "ok"}

**Evidence:**

- `probed-paths`: /, /health, /healthz, /ready, /docs, /openapi.json

### No rate limiting detected

**File:** `/home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/fastapi-open-cors/main.py`

No rate limiting library was found. The API is vulnerable to brute-force and DoS attacks.

**Suggested Fix:**

Add slowapi: app.state.limiter = Limiter(key_func=get_remote_address).

**Evidence:**

- `no-rate-limit`: No rate limiting library detected

## Low Findings

_No low severity findings._
## Evidence Index

### Logs

- [logs/fastapi-import-check_2026-06-20T10-40-43-093Z.log](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/fastapi-open-cors/.turpan/runs/2026-06-20T10-40-42-916Z/logs/fastapi-import-check_2026-06-20T10-40-43-093Z.log) (0.4 KB)
- [logs/turpan.log](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/fastapi-open-cors/.turpan/runs/2026-06-20T10-40-42-916Z/logs/turpan.log) (0.1 KB)

### JSON Files

- [TURPAN_FINDINGS.json](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/fastapi-open-cors/.turpan/runs/2026-06-20T10-40-42-916Z/TURPAN_FINDINGS.json) (5.9 KB)
- [TURPAN_SCORECARD.json](file:///home/oguz/Masaüstü/TurPAN-Review-Agent/examples/fixtures/fastapi-open-cors/.turpan/runs/2026-06-20T10-40-42-916Z/TURPAN_SCORECARD.json) (0.2 KB)
