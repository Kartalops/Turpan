import { cookies } from 'next/headers';

export default function DashboardPage() {
  const cookieStore = cookies();
  const isAuthed = cookieStore.get('auth_token');

  if (!isAuthed) {
    return (
      <main style={{ padding: '2rem' }}>
        <h1>Dashboard</h1>
        <p>Please <a href="/login">sign in</a> to view your dashboard.</p>
      </main>
    );
  }

  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Dashboard</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
        <div className="card" data-widget style={{ padding: '1rem', border: '1px solid #ddd', borderRadius: '8px' }}>
          <h3>Revenue</h3>
          <p style={{ fontSize: '2rem', margin: '0.5rem 0 0', fontWeight: 'bold' }}>$24,500</p>
        </div>
        <div className="card" data-widget style={{ padding: '1rem', border: '1px solid #ddd', borderRadius: '8px' }}>
          <h3>Users</h3>
          <p style={{ fontSize: '2rem', margin: '0.5rem 0 0', fontWeight: 'bold' }}>1,234</p>
        </div>
        <div className="card" data-widget style={{ padding: '1rem', border: '1px solid #ddd', borderRadius: '8px' }}>
          <h3>Active Sessions</h3>
          <p style={{ fontSize: '2rem', margin: '0.5rem 0 0', fontWeight: 'bold' }}>89</p>
        </div>
      </div>
      <nav role="navigation" style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
        <a href="/settings">Settings</a>
        <a href="/billing">Billing</a>
      </nav>
    </main>
  );
}
