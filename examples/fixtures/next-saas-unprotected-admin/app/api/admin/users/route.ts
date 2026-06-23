// SECURITY ISSUE: Admin API endpoint without auth check.
// Real production code must verify session role.

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  const users = await db.user.findMany();
  return NextResponse.json({ users });
}

export async function DELETE(req: NextRequest) {
  // SECURITY: deletes users without any authorization check
  const { userId } = await req.json();
  await db.user.delete({ where: { id: userId } });
  return NextResponse.json({ ok: true });
}
