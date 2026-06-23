# vite-ui-console-error

A Vite + React app that intentionally throws a runtime error and emits a `console.error` on mount.

## Issues intentionally planted

- `BadComponent` calls `notDefinedFunction()` which is undefined → ReferenceError
- `useEffect` logs `console.error('Initial setup failed')`

## Expected eval result

- Verdict: CONDITIONAL_GO or NO_GO
- At least 1 finding in category `ui` related to console errors
- Playwright runtime test (if --ui is enabled) should detect the ReferenceError
