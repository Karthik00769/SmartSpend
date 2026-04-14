/**
 * app/api/settings/delete-account/route.ts
 */
import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/api-response';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/authOptions";
import { deleteAccount } from '@/services/user.service';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  const userId = (session.user as any).id as string;

  try {
    const success = await deleteAccount(userId);
    if (!success) return fail('Failed to delete account.', 500);

    return ok({ message: 'Account deleted. You will be logged out.' });
  } catch (err) {
    console.error('[POST /api/settings/delete-account]', err);
    return fail('Internal server error', 500);
  }
}
