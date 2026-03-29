/**
 * app/api/insights/generate/route.ts
 * ─────────────────────────────────────────────────────────────────────
 * POST /api/insights/generate
 * Triggers the rules engine for a user's current month.
 * Idempotent — safe to call from a Vercel Cron Job daily.
 *
 * Example:
 *   POST /api/insights/generate
 *   { "userId": "1" }           // uses current month/year automatically
 */
import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/api-response';
import { generateMonthlyInsights } from '@/services/insight.service';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/authOptions";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  const userId = (session.user as any).id as string;

  const now   = new Date();
  const month = now.getMonth() + 1;
  const year  = now.getFullYear();

  try {
    const created = await generateMonthlyInsights(userId, month, year);
    return ok({

      message: `Generated ${created} new insight(s) for ${month}/${year}.`,
      created,
      month,
      year,
    }, 201);
  } catch (err) {
    console.error('[POST /api/insights/generate]', err);
    return fail('Insight generation failed.', 500);
  }
}
