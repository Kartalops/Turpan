// Stub webhook handler — does not verify signature, no real provider

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  // Just acknowledges — no signature check
  return NextResponse.json({ ok: true });
}
