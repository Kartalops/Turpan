'use client';

import { useState } from 'react';

export default function PricingPage() {
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async (plan: string) => {
    setLoading(true);
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId: plan, amount: 29 }),
    });
    const data = await res.json();
    // BUG: shows alert regardless of success
    alert(`Subscription created: ${data.subscriptionId}`);
    setLoading(false);
  };

  return (
    <main>
      <h1>Pricing</h1>
      <button onClick={() => handleSubscribe('pro')} disabled={loading}>
        Subscribe to Pro
      </button>
    </main>
  );
}
