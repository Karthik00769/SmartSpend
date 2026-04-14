/**
 * app/api/settings/2fa/route.ts
 */
import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/api-response';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/authOptions";
import { update2FAPin } from '@/services/user.service';
import { z } from 'zod';
import { parseBody } from '@/lib/validate';

const TwoFASchema = z.object({
  pin: z.string().length(6).regex(/^\d+$/).nullable(),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  const userId = (session.user as any).id as string;
  const parsed = await parseBody(req, TwoFASchema);
  if (!parsed.success) return fail(parsed.message, 400, parsed.fieldErrors);

  try {
    const success = await update2FAPin(userId, parsed.data.pin);
    if (!success) return fail('Failed to update 2FA PIN.', 500);
    return ok({ message: parsed.data.pin ? '2FA PIN enabled' : '2FA PIN disabled' });
  } catch (err) {
    console.error('[POST /api/settings/2fa]', err);
    return fail('Internal server error', 500);
  }
}
