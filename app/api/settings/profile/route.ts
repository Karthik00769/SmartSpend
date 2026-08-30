/**
 * app/api/settings/profile/route.ts
 */
import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/api-response';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/authOptions";
import { getUserProfile, updateUserProfile } from '@/services/user.service';
import { z } from 'zod';
import { parseBody } from '@/lib/validate';
import { query } from '@/lib/db';
import * as FinanceCore from '@/lib/finance';

const ProfileUpdateSchema = z.object({
  name:           z.string().min(2).max(100).optional(),
  email:          z.string().email().optional(),
  monthly_income: z.preprocess((val) => Number(val), z.number().min(0)),
  currency:       z.string().length(3).default('USD'),
  timezone:       z.string().max(50).default('Asia/Kolkata'),
  preferences:    z.object({
    budgetAlerts: z.boolean().optional(),
    aiInsights:   z.boolean().optional(),
    weeklyDigest: z.boolean().optional(),
  }).optional(),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  try {
    const userId = (session.user as any).id as string;
    if (!userId) return fail('User ID missing from session', 400);

    const profile = await getUserProfile(userId);

    // User may exist but be soft-deleted or inactive — return a safe default
    if (!profile) {
      return ok({
        id: userId,
        name: (session.user as any).name ?? '',
        email: (session.user as any).email ?? '',
        monthly_income: 0,
        currency: 'USD',
        timezone: 'Asia/Kolkata',
        twoFactorEnabled: false,
        preferences: { budgetAlerts: true, aiInsights: true, weeklyDigest: false },
        sessionVersion: 1,
      });
    }

    return ok({
      ...profile,
      monthly_income: FinanceCore.Math.paiseToInr(profile.monthlyIncomePaise)
    });
  } catch (err: any) {
    console.error('[GET /api/settings/profile] ERROR:', err?.message ?? err, err?.stack);
    return fail(err?.message ?? 'Failed to fetch profile settings', 500);
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  const userId = (session.user as any).id as string;

  const parsed = await parseBody(req, ProfileUpdateSchema);
  if (!parsed.success) return fail(parsed.message, 400, parsed.fieldErrors);

  try {
    const currentProfile = await getUserProfile(userId);
    if (!currentProfile) return fail('User not found', 404);

    // If email is changing, check for uniqueness
    if (parsed.data.email && parsed.data.email !== currentProfile.email) {
      const existing = await query<any[]>('SELECT id FROM users WHERE email = ? AND id != ?', [parsed.data.email, userId]);
      if (existing.length > 0) return fail('Email already in use by another account.', 400);
    }

    const success = await updateUserProfile(userId, {
      name:           parsed.data.name,
      email:          parsed.data.email,
      monthlyIncomePaise: FinanceCore.Math.inrToPaise(parsed.data.monthly_income),
      currency:       parsed.data.currency,
      timezone:       parsed.data.timezone,
      preferences:    parsed.data.preferences as any,
    });

    if (!success) return fail('Failed to update profile.', 500);

    return ok({ message: 'Profile updated successfully' });
  } catch (err) {
    console.error('[POST /api/settings/profile]', err);
    return fail('Internal server error', 500);
  }
}
