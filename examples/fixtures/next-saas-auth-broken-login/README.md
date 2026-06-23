# next-saas-auth-broken-login

ISSUE: Login form has no error handling — wrong credentials still redirect to dashboard.

Expected: Turpan should detect missing error feedback (no role="alert", no error class) and flag as a finding.