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
    <main style={{ padding: '2rem' }}>
      <h1>Dashboard</h1>
      <p>Welcome to your dashboard.</p>
    </main>
  );
}