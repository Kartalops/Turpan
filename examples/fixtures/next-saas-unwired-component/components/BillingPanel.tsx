'use client';

import { useState } from 'react';

interface Plan {
  id: string;
  name: string;
  price: number;
  features: string[];
}

const PLANS: Plan[] = [
  { id: 'starter', name: 'Starter', price: 9, features: ['5 projects', 'Basic support'] },
  { id: 'pro', name: 'Pro', price: 29, features: ['Unlimited projects', 'Priority support'] },
  { id: 'enterprise', name: 'Enterprise', price: 99, features: ['Custom limits', 'Dedicated support'] },
];

export default function BillingPanel() {
  const [selected, setSelected] = useState<string>('pro');

  return (
    <div style={{ padding: '2rem' }}>
      <h2>Billing &amp; Subscription</h2>
      <p>Manage your subscription and billing information.</p>
      <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
        {PLANS.map(plan => (
          <div
            key={plan.id}
            style={{
              border: selected === plan.id ? '2px solid #0070f3' : '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1rem',
              cursor: 'pointer',
            }}
            onClick={() => setSelected(plan.id)}
          >
            <h3>{plan.name}</h3>
            <p>${plan.price}/month</p>
            <ul>
              {plan.features.map(f => <li key={f}>{f}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
