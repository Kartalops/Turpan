import React from 'react';

export default function Dashboard() {
  const metrics = [
    { label: 'Total Users', value: '1,234' },
    { label: 'Revenue', value: '$45,678' },
    { label: 'Active Sessions', value: '89' },
  ];

  return (
    <div>
      <h1>Dashboard</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginTop: '1.5rem' }}>
        {metrics.map((m) => (
          <div key={m.label} style={{ padding: '1rem', border: '1px solid #ddd', borderRadius: '0.5rem' }}>
            <div style={{ color: '#666', fontSize: '0.875rem' }}>{m.label}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', marginTop: '0.25rem' }}>{m.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}