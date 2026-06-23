import { cookies } from 'next/headers';

export default function SettingsPage() {
  const cookieStore = cookies();
  const isAuthed = cookieStore.get('auth_token');

  if (!isAuthed) {
    return (
      <main style={{ padding: '2rem' }}>
        <h1>Settings</h1>
        <p>Please <a href="/login">sign in</a> to view settings.</p>
      </main>
    );
  }

  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Account Settings</h1>
      <form className="settings-form" style={{ marginTop: '1.5rem', maxWidth: '500px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <label htmlFor="name" style={{ display: 'block', marginBottom: '0.25rem' }}>Full Name</label>
          <input id="name" type="text" defaultValue="Turpan Test" style={{ width: '100%', padding: '0.5rem', fontSize: '1rem' }} />
        </div>
        <div>
          <label htmlFor="email" style={{ display: 'block', marginBottom: '0.25rem' }}>Email</label>
          <input id="email" type="email" defaultValue="turpan-test@example.com" style={{ width: '100%', padding: '0.5rem', fontSize: '1rem' }} />
        </div>
        <div>
          <label htmlFor="company" style={{ display: 'block', marginBottom: '0.25rem' }}>Company</label>
          <input id="company" type="text" defaultValue="Turpan QA" style={{ width: '100%', padding: '0.5rem', fontSize: '1rem' }} />
        </div>
        <div>
          <input type="checkbox" id="notifications" defaultChecked />
          <label htmlFor="notifications" style={{ marginLeft: '0.5rem' }}>Receive email notifications</label>
        </div>
        <button type="button">Save Changes</button>
      </form>
    </main>
  );
}
