/**
 * app/api/settings/password/route.ts
 */
import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/api-response';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/authOptions";
import { verifyPassword, updatePassword } from '@/services/user.service';
import { z } from 'zod';
import { parseBody } from '@/lib/validate';

const PasswordUpdateSchema = z.object({
  current: z.string().min(1),
  new:     z.string().min(8).max(100),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  const userId = (session.user as any).id as string;

  const parsed = await parseBody(req, PasswordUpdateSchema);
  if (!parsed.success) return fail(parsed.message, 400, parsed.fieldErrors);

  try {
    const isMatched = await verifyPassword(userId, parsed.data.current);
    if (!isMatched) return fail('Current password is incorrect.', 400);

    const success = await updatePassword(userId, parsed.data.new);
    if (!success) return fail('Failed to update password.', 500);

    return ok({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('[POST /api/settings/password]', err);
    return fail('Internal server error', 500);
  }
}
