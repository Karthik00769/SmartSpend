import { NextRequest } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/authOptions";
import { ok, fail } from '@/lib/api-response';
import { processRecurringExpenses } from '@/services/recurring.service';

/**
 * GET /api/expenses/process-recurring
 * 
 * Auto-processes and creates duplicates for all due recurring expense templates 
 * matching the user's session today.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  const userId = (session.user as any).id as string;

  try {
    const createdCount = await processRecurringExpenses(userId);
    return ok({ createdCount, message: `Successfully generated ${createdCount} recurring items.` });
    
  } catch (err: any) {
    console.error('[GET /api/expenses/process-recurring]', err);
    return fail('Failed to generate recurring entries.', 500);
  }
}
