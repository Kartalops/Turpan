// INTENTIONALLY FAKE — this is the eval fixture, not a real checkout.
// Real billing would call Stripe / LemonSqueezy / similar.

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { planId, amount } = body;

  // TODO: integrate with real payment provider
  console.log('Checkout requested', planId, amount);

  // Pretend success
  return NextResponse.json({
    ok: true,
    subscriptionId: `sub_fake_${Date.now()}`,
    message: 'TODO: wire up Stripe',
  });
}
