export default function PricingPage() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Pricing Plans</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginTop: '2rem' }}>
        <div className="plan-card" data-plan="starter" style={{ padding: '1.5rem', border: '1px solid #ddd', borderRadius: '12px' }}>
          <h2>Starter</h2>
          <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0.5rem 0' }}>$9<span style={{ fontSize: '1rem' }}>/mo</span></p>
          <ul style={{ margin: '1rem 0', paddingLeft: '1.5rem' }}>
            <li>5 users</li>
            <li>10GB storage</li>
            <li>Email support</li>
          </ul>
          <button data-testid="subscribe-starter">Get Started</button>
        </div>
        <div className="plan-card" data-plan="pro" style={{ padding: '1.5rem', border: '2px solid #0070f3', borderRadius: '12px' }}>
          <h2>Pro</h2>
          <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0.5rem 0' }}>$29<span style={{ fontSize: '1rem' }}>/mo</span></p>
          <ul style={{ margin: '1rem 0', paddingLeft: '1.5rem' }}>
            <li>25 users</li>
            <li>100GB storage</li>
            <li>Priority support</li>
          </ul>
          <button data-testid="subscribe-pro">Get Started</button>
        </div>
      </div>
      <div style={{ marginTop: '2rem' }}>
        <a href="/api/test-checkout">Test Checkout Endpoint</a>
      </div>
    </main>
  );
}
