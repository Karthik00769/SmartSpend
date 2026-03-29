/**
 * app/api/settings/profile/route.ts
 * ─────────────────────────────────────────────────────────────────────
 * GET  /api/settings/profile  — fetch profile data
 * POST /api/settings/profile  — update profile data
 */
import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/api-response';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/authOptions";
import { getUserProfile, updateUserProfile } from '@/services/user.service';
import { z } from 'zod';
import { parseBody } from '@/lib/validate';

const ProfileUpdateSchema = z.object({
  name:          z.string().min(2).max(100).optional(),
  email:         z.string().email().optional(), // email updates usually need more logic, but we'll allow it for now if needed.
  monthly_income: z.preprocess((val) => Number(val), z.number().min(0)),
  currency:      z.string().length(3).default('USD'),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  try {
    const userId = (session.user as any).id as string;
    const profile = await getUserProfile(userId);

    if (!profile) return fail('User not found', 404);

    return ok(profile);
  } catch (err) {
    console.error('[GET /api/settings/profile]', err);
    return fail('Failed to fetch profile settings', 500);
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  const userId = (session.user as any).id as string;

  const parsed = await parseBody(req, ProfileUpdateSchema);
  if (!parsed.success) return fail(parsed.message, 400, parsed.fieldErrors);

  try {
    const success = await updateUserProfile(userId, {
      name:           parsed.data.name,
      monthly_income: parsed.data.monthly_income,
      currency:       parsed.data.currency,
    });

    if (!success) return fail('Failed to update profile.', 500);

    return ok({ message: 'Profile updated successfully' });
  } catch (err) {
    console.error('[POST /api/settings/profile]', err);
    return fail('Internal server error', 500);
  }
}
