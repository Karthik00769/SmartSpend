import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/authOptions";
import { ok, fail } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  try {
    const userId = (session.user as any).id;
    
    // Fetch system categories + user's custom categories
    const categories = await query<any[]>(
      `SELECT id, name as label, icon, color_hex as color, is_system as isSystem 
       FROM categories 
       WHERE is_system = 1 OR user_id = ?
       ORDER BY is_system DESC, name ASC`,
      [userId]
    );

    return ok({ categories });
  } catch (err) {
    console.error('[GET /api/categories]', err);
    return fail('Failed to fetch categories', 500);
  }
}
