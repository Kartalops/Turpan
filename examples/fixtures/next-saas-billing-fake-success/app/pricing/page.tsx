export default function PricingPage() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Pricing Plans</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginTop: '2rem' }}>
        <div className="plan-card" data-plan="starter" style={{ padding: '1.5rem', border: '1px solid #ddd', borderRadius: '12px' }}>
          <h2>Starter</h2>
          <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0.5rem 0' }}>$9<span style={{ fontSize: '1rem' }}>/mo</span></p>
          <button data-testid="subscribe-starter">Subscribe</button>
        </div>
        <div className="plan-card" data-plan="pro" style={{ padding: '1.5rem', border: '2px solid #0070f3', borderRadius: '12px' }}>
          <h2>Pro</h2>
          <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0.5rem 0' }}>$29<span style={{ fontSize: '1rem' }}>/mo</span></p>
          <button data-testid="subscribe-pro">Subscribe</button>
        </div>
      </div>
    </main>
  );
}
