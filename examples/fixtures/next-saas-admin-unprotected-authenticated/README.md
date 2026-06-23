# next-saas-admin-unprotected-authenticated

Phase 27 fixture for authenticated SaaS admin scenario testing.

## Purpose

Tests the `next-saas-admin-unprotected-authenticated` scenario which:
1. Tests unauthenticated access FIRST (critical security check).
2. If admin page is accessible without auth → CRITICAL finding (auth bypass).
3. If authenticated test user is not admin, admin should still be blocked.
4. Does NOT attempt privilege escalation.

## Expected behavior

The admin page is intentionally unprotected in this fixture to test that the
scenario correctly flags it as a critical security vulnerability.

## Running

```bash
turpan review . --ui --scenarios next-saas-admin-unprotected-authenticated
```

Or via eval:

```bash
pnpm eval --fixture next-saas-admin-unprotected-authenticated
```

## Safety guarantees

- Does NOT submit real credentials.
- Does NOT attempt privilege escalation.
- Does NOT click destructive admin actions.
- Only reads the admin page to detect its presence/absence.
