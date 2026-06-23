'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (email === 'turpan-test@example.com' && password === 'TurpanTest123!') {
      document.cookie = `auth_token=demo_token_${Date.now()}; path=/; max-age=3600`;
      router.push('/settings');
    }
  }

  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif', maxWidth: '400px', margin: '0 auto' }}>
      <h1>Sign In</h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
        <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required style={{ width: '100%', padding: '0.5rem', fontSize: '1rem' }} />
        <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required style={{ width: '100%', padding: '0.5rem', fontSize: '1rem' }} />
        <button type="submit" style={{ padding: '0.75rem', fontSize: '1rem', cursor: 'pointer' }}>Log In</button>
      </form>
      <p style={{ marginTop: '1rem' }}><small>Test: turpan-test@example.com / TurpanTest123!</small></p>
    </main>
  );
}
