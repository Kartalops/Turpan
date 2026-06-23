// Page with INTENTIONAL type errors — Turpan should detect the broken build
import { useState } from 'react';

export default function BrokenPage() {
  const [count, setCount] = useState(0);

  // Type error: passing string to setCount which expects number
  const handleClick = () => {
    setCount('not a number');
  };

  // Reference to undefined variable
  const result = undefinedVariable + 5;

  return (
    <main>
      <h1>Broken Page</h1>
      <button onClick={handleClick}>Count: {count}</button>
      <p>Result: {result}</p>
    </main>
  );
}
