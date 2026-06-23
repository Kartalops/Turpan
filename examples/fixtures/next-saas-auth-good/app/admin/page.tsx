import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default function AdminPage() {
  const cookieStore = cookies();
  const token = cookieStore.get('auth_token');

  // Simple check: only allow specific admin email via a token prefix
  // In a real app this would be a proper session check
  const isAdmin = token?.value?.includes('admin');

  if (!token) {
    redirect('/login');
  }

  if (!isAdmin) {
    return (
      <main style={{ padding: '2rem' }}>
        <h1>Admin Panel</h1>
        <p>You do not have admin privileges.</p>
      </main>
    );
  }

  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Admin Panel</h1>
      <p>Welcome, administrator.</p>
      <div style={{ marginTop: '1.5rem' }}>
        <p>Total users: <strong>1,234</strong></p>
        <p>Active subscriptions: <strong>847</strong></p>
      </div>
    </main>
  );
}
