'use client';

export default function PricingPage() {
  return (
    <main style={{ padding: '2rem' }}>
      <h1>Plans &amp; Pricing</h1>
      <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem' }}>
          <h2>Pro</h2>
          <p style={{ fontSize: '2rem', fontWeight: 'bold' }}>$29<span style={{ fontSize: '1rem' }}>/mo</span></p>
          <ul>
            <li>Unlimited projects</li>
            <li>Priority support</li>
            <li>Advanced analytics</li>
          </ul>
          <button
            onClick={() => {
              // TODO: connect to Stripe checkout
              alert('Coming soon!');
            }}
            style={{
              marginTop: '1rem',
              padding: '0.75rem 1.5rem',
              backgroundColor: '#0070f3',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            Get Started
          </button>
        </div>
      </div>
    </main>
  );
}
