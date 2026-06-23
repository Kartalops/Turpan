import { cookies } from 'next/headers';

export default function DashboardPage() {
  const cookieStore = cookies();
  const isAuthed = cookieStore.get('auth_token');

  if (!isAuthed) {
    return (
      <main style={{ padding: '2rem' }}>
        <h1>Dashboard</h1>
        <p>Please <a href="/login">sign in</a>.</p>
      </main>
    );
  }

  // BUG: Dashboard is completely empty — no widgets, no content
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Dashboard</h1>
      {/* Intentionally blank — no cards, no stats, no widgets */}
    </main>
  );
}
