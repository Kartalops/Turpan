import React from 'react';

export default function Home() {
  return (
    <div>
      <h1>Welcome to Acme SaaS</h1>
      <p>Build faster with our platform.</p>
      <button onClick={() => alert('Get Started clicked')}>Get Started</button>
      <button onClick={() => alert('Learn More clicked')}>Learn More</button>
      <div style={{ marginTop: '2rem' }}>
        <h2>Features</h2>
        <ul>
          <li>Fast and reliable</li>
          <li>Secure by default</li>
          <li>Easy to use</li>
        </ul>
      </div>
    </div>
  );
}