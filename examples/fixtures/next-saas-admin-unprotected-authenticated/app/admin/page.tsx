// SECURITY ISSUE: Admin page is unprotected — anyone can access it.
// Real SaaS admin pages must verify session and role.

import { db } from '@/lib/db';

export default async function AdminPage() {
  const users = await db.user.findMany();
  const apiKeys = await db.apiKey.findMany();

  return (
    <main>
      <h1>Admin Panel</h1>
      <h2>All Users ({users.length})</h2>
      <ul>
        {users.map((u) => (
          <li key={u.id}>{u.email}</li>
        ))}
      </ul>
      <h2>API Keys</h2>
      <ul>
        {apiKeys.map((k) => (
          <li key={k.id}>{k.value}</li>
        ))}
      </ul>
    </main>
  );
}
