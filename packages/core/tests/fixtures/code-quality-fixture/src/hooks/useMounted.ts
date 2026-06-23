// Exported function that is never imported elsewhere
export function unusedHelper(): string {
  return 'this is never used';
}

// Another unused export
export const UNUSED_CONSTANT = 'not used anywhere';

// Default export
export default function UnusedDefault() {
  return <div>Not imported</div>;
}

// Re-export pattern that makes unused export detection harder
export { helper } from './helper.js';
