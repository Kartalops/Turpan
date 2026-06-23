// Fake Stripe checkout — returns hardcoded success
import Stripe from 'stripe';

const stripe = new Stripe('sk_test_fake_key');

export async function POST(request: Request) {
  // TODO: implement real Stripe checkout
  return Response.json({ success: true, url: 'https://fake-checkout.stripe.com' });
}
