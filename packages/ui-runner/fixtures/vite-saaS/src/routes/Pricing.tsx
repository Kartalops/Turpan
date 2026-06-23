import React from 'react';

export default function Pricing() {
  const plans = [
    { name: 'Starter', price: '$9/mo', features: ['5 projects', 'Basic analytics', 'Email support'] },
    { name: 'Pro', price: '$29/mo', features: ['25 projects', 'Advanced analytics', 'Priority support'] },
    { name: 'Enterprise', price: '$99/mo', features: ['Unlimited', 'Custom integrations', 'Dedicated support'] },
  ];

  return (
    <div>
      <h1>Pricing</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginTop: '1.5rem' }}>
        {plans.map((plan) => (
          <div key={plan.name} style={{ padding: '1.5rem', border: '1px solid #ddd', borderRadius: '0.5rem' }}>
            <h2 style={{ margin: 0 }}>{plan.name}</h2>
            <div style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: '0.5rem 0' }}>{plan.price}</div>
            <ul style={{ paddingLeft: '1.25rem', margin: '0.5rem 0' }}>
              {plan.features.map((f) => <li key={f}>{f}</li>)}
            </ul>
            <button onClick={() => alert(`${plan.name} selected`)}>Choose {plan.name}</button>
          </div>
        ))}
      </div>
    </div>
  );
}