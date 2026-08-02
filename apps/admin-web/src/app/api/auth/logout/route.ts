import { NextResponse } from 'next/server';
import { REFRESH_COOKIE_NAME } from '../../../../lib/api-url';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(REFRESH_COOKIE_NAME);
  return response;
}
