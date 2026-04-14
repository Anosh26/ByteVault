import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLoggedIn = request.cookies.get('bv_logged_in')?.value === 'true';

  const isProtectedRoute = pathname.startsWith('/dashboard') || pathname.startsWith('/admin');

  if (isProtectedRoute && !isLoggedIn) return NextResponse.redirect(new URL('/login', request.url));
  if (pathname === '/login' && isLoggedIn) return NextResponse.redirect(new URL('/dashboard', request.url));
  if (pathname === '/') return NextResponse.redirect(new URL(isLoggedIn ? '/dashboard' : '/login', request.url));

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/dashboard/:path*', '/admin/:path*', '/login'],
};

