/**
 * app/api/settings/force-logout/route.ts
 */
import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/api-response';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/authOptions";
import { resetSessionVersion } from '@/services/user.service';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  const userId = (session.user as any).id as string;

  try {
    const success = await resetSessionVersion(userId);
    if (!success) return fail('Failed to reset session version.', 500);
    return ok({ message: 'All devices logged out. Your current session will expire soon.' });
  } catch (err) {
    console.error('[POST /api/settings/force-logout]', err);
    return fail('Internal server error', 500);
  }
}
