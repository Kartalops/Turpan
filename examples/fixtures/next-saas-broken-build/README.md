# next-saas-broken-build

A Next.js SaaS app with intentional type errors and an undefined variable reference that will fail `tsc --noEmit` and `next build`.

## Issues intentionally planted

- `setCount('not a number')` — type mismatch with `useState<number>`
- `undefinedVariable + 5` — ReferenceError at runtime

## Expected eval result

- Verdict: NO_GO
- Build stage should fail with a critical finding
- At least 1 critical finding (type error)
