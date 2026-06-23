# next-saas-fake-billing

A Next.js SaaS where the billing API is a TODO stub — it returns success but never charges anyone.

## Issues intentionally planted

- `/api/checkout` returns `subscriptionId: sub_fake_…` without integrating with a real payment provider
- Webhook handler at `/api/billing` doesn't verify signatures
- "TODO: integrate with real payment provider" left in code

## Expected eval result

- Verdict: CONDITIONAL_GO or NO_GO
- At least 1 finding in category `security` or `api-design` related to fake billing
- TODO comments flagged by placeholder analyzer
