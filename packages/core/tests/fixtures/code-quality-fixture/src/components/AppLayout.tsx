// Architecture fixture — business logic in UI component
import React, { useState } from 'react';

// This file mixes business logic with UI — architectural smell
export function AppLayout() {
  const [user, setUser] = useState<{ name: string; token: string } | null>(null);
  const [data, setData] = useState<unknown[]>([]);

  const login = async () => {
    // Business logic directly in component — should be in a service
    const response = await fetch('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'user', password: 'pass' }),
    });
    const result = await response.json();
    setUser(result);
  };

  const fetchData = async () => {
    if (!user?.token) return;
    // Direct API call in component
    const res = await fetch('/api/data', {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    const json = await res.json();
    setData(json);
  };

  const saveToDatabase = async (item: unknown) => {
    // Direct database call in UI component — architectural smell
    await fetch('/api/save', {
      method: 'POST',
      body: JSON.stringify({ table: 'items', data: item }),
    });
  };

  return (
    <div>
      <button onClick={login}>Login</button>
      <button onClick={fetchData}>Fetch Data</button>
    </div>
  );
}
