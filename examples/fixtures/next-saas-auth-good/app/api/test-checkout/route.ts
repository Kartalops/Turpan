import { NextResponse } from 'next/server';

export async function POST() {
  // This is a local test endpoint for QA testing only
  return NextResponse.json({
    subscriptionId: `sub_real_${Date.now()}`,
    status: 'active',
    plan: 'pro',
    amount: 2900,
    currency: 'usd',
  });
}
