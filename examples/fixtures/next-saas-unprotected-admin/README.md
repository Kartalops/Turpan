# next-saas-unprotected-admin

A Next.js SaaS where the admin panel and admin API endpoints are completely unprotected.

## Issues intentionally planted

- `/admin` page renders all users and API keys without checking auth
- `/api/admin/users` GET and DELETE handlers have no authorization check
- Sensitive data (API keys, user emails) exposed in client-rendered HTML

## Expected eval result

- Verdict: NO_GO
- At least 1 critical or high finding in category `security`
- A finding mentioning missing auth on the admin route
