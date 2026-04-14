import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/api-response';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/authOptions";
import { getAuditLogs } from '@/services/audit.service';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  try {
    const userId = (session.user as any).id as string;
    const logs = await getAuditLogs(userId);
    return ok(logs);
  } catch (err) {
    console.error('[GET /api/audit-logs]', err);
    return fail('Failed to fetch audit logs.', 500);
  }
}
