export default function HomePage() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Welcome to SaaS App</h1>
      <p>Your all-in-one business platform.</p>
      <nav style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
        <a href="/login">Login</a>
        <a href="/dashboard">Dashboard</a>
        <a href="/pricing">Pricing</a>
        <a href="/settings">Settings</a>
        <a href="/admin">Admin</a>
      </nav>
    </main>
  );
}
