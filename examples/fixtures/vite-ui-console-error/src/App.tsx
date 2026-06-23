// INTENTIONALLY BUGGY — will throw a runtime error in the browser.
// Used as a fixture for UI testing — Turpan should detect the console error.

import { useEffect, useState } from 'react';

function BadComponent() {
  // ReferenceError: notDefinedFunction does not exist
  const value = notDefinedFunction();
  return <div>{value}</div>;
}

export default function App() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    // Side-effect that logs an error
    console.error('Initial setup failed: missing config');
  }, []);

  return (
    <main>
      <h1>Vite UI Demo</h1>
      <button onClick={() => setCount(count + 1)}>Count: {count}</button>
      <BadComponent />
    </main>
  );
}
