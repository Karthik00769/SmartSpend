import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export default async function proxy(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  const { pathname } = request.nextUrl;

  // Unauthenticated requests to protected routes
  if (!token) {
    // API routes → 401 JSON
    if (pathname.startsWith('/api/')) {
      return new NextResponse(
        JSON.stringify({ ok: false, error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    }
    // App pages → redirect to login
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Protected app pages only — do NOT include /login or /signup
    // Those are public pages; the login page handles its own post-auth redirect
    '/dashboard/:path*',
    '/add-expense/:path*',
    '/budgets/:path*',
    '/goals/:path*',
    '/insights/:path*',
    '/reports/:path*',
    '/settings/:path*',
    '/expenses-history/:path*',
    '/audit-logs/:path*',

    // Protected API routes
    '/api/analytics/:path*',
    '/api/budgets/:path*',
    '/api/categories/:path*',
    '/api/dashboard/:path*',
    '/api/dashboard-summary/:path*',
    '/api/expenses/:path*',
    '/api/goals/:path*',
    '/api/insights/:path*',
    '/api/reports/:path*',
    '/api/settings/:path*',
  ],
};
