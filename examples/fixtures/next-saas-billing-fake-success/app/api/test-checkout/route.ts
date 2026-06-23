import { NextResponse } from 'next/server';

// BUG: Returns fake subscription IDs — no real payment provider integration
export async function POST() {
  return NextResponse.json({
    // Fake subscription ID — looks like Stripe but isn't
    subscriptionId: `sub_fake_${Date.now()}`,
    // Fake payment intent
    paymentIntent: `pi_fake_${Date.now()}`,
    // Fake client secret
    clientSecret: `secret_fake_${Date.now()}`,
    // Says it's active but it's not real
    status: 'active',
    plan: 'pro',
    // Positive amount but no money changes hands
    amount: 2900,
    currency: 'usd',
  });
}
