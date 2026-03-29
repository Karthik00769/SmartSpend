import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/authOptions";
import { ok, fail } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  return ok({
    categories: [
      { id: 1, label: 'Food & Dining', icon: '🍔', color: '#F97316', isSystem: true },
      { id: 2, label: 'Transportation', icon: '🚗', color: '#0891B2', isSystem: true },
      { id: 3, label: 'Utilities', icon: '💡', color: '#EAB308', isSystem: true },
      { id: 4, label: 'Entertainment', icon: '🎬', color: '#A855F7', isSystem: true },
      { id: 5, label: 'Shopping', icon: '🛍️', color: '#EC4899', isSystem: true },
      { id: 6, label: 'Healthcare', icon: '🏥', color: '#EF4444', isSystem: true },
      { id: 7, label: 'Education', icon: '📚', color: '#22C55E', isSystem: true },
      { id: 8, label: 'Subscriptions', icon: '📱', color: '#6366F1', isSystem: true },
      { id: 9, label: 'Other', icon: '📌', color: '#6B7280', isSystem: true },
    ]
  });
}
