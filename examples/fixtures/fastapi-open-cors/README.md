# fastapi-open-cors

A FastAPI app with permissive CORS configuration and an unauthenticated PII endpoint.

## Issues intentionally planted

- `allow_origins=["*"]` combined with `allow_credentials=True`
- `/users` returns user PII (emails) with no auth check

## Expected eval result

- Verdict: CONDITIONAL_GO or NO_GO
- At least 1 finding in category `security` about CORS
- A finding about the open PII endpoint if applicable
