import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export default async function proxy(request: NextRequest) {
  const token = await getToken({ 
    req: request, 
    secret: process.env.NEXTAUTH_SECRET 
  });

  const { pathname } = request.nextUrl;

  if (!token) {
    if (pathname.startsWith('/api/')) {
        return new NextResponse(
          JSON.stringify({ ok: false, error: 'Unauthorized' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/add-expense/:path*",
    "/budgets/:path*",
    "/goals/:path*",
    "/insights/:path*",
    "/reports/:path*",
    "/settings/:path*",

    "/api/analytics/:path*",
    "/api/budgets/:path*",
    "/api/categories/:path*",
    "/api/dashboard/:path*",
    "/api/dashboard-summary/:path*",
    "/api/expenses/:path*",
    "/api/goals/:path*",
    "/api/insights/:path*",
    "/api/reports/:path*",
  ],
};
