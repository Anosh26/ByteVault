import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // If the user is at the root "/" redirect them to "/login"
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

// This tells Next.js exactly which paths this guard should watch
export const config = {
  matcher: '/',
};