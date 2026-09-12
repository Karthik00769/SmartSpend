/**
 * app/api/settings/2fa/route.ts
 */
import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/api-response';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/authOptions";
import { update2FAPin } from '@/services/user.service';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { z } from 'zod';
import { parseBody } from '@/lib/validate';

const BLACKLISTED_PINS = new Set([
  '000000', '111111', '222222', '333333', '444444',
  '555555', '666666', '777777', '888888', '999999',
  '123456', '654321', '121212', '112233', '123123'
]);

const TwoFASchema = z.object({
  pin: z.string().length(6).regex(/^\d+$/).nullable(),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  const userId = (session.user as any).id as string;

  // Rate limiting
  const rateLimitCheck = checkRateLimit(`2fa:${userId}`, RATE_LIMITS.TWO_FA);
  if (!rateLimitCheck.allowed) {
    return fail('Too many 2FA attempts. Please try again later.', 429);
  }

  const parsed = await parseBody(req, TwoFASchema);
  if (!parsed.success) return fail(parsed.message, 400, parsed.fieldErrors);

  // Check PIN blacklist
  if (parsed.data.pin && BLACKLISTED_PINS.has(parsed.data.pin)) {
    return fail('PIN is too weak. Choose a less predictable PIN.', 400);
  }

  try {
    const success = await update2FAPin(userId, parsed.data.pin, { req });
    if (!success) return fail('Failed to update 2FA PIN.', 500);
    
    const message = parsed.data.pin 
      ? '2FA PIN enabled' 
      : '2FA PIN disabled. All other sessions have been logged out.';
    
    return ok({ message });
  } catch (err) {
    console.error('[POST /api/settings/2fa]', err);
    return fail('Internal server error', 500);
  }
}
