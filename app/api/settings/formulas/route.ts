import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/api-response';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/authOptions';
import { generateFormulaSheet } from '@/lib/ai/formulaGenerator';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  // default to ₹ if no specified currency
  const searchParams = req.nextUrl.searchParams;
  const currency = searchParams.get('currency') || '₹';

  try {
    const formulas = await generateFormulaSheet(currency);
    return ok({ formulas });
  } catch (error) {
    console.error('[GET /api/settings/formulas]', error);
    return fail('Failed to fetch formulas.', 500);
  }
}
