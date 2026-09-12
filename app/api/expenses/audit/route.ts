/**
 * app/api/expenses/audit/route.ts
 * GET /api/expenses/audit — fetch expense audit log entries
 */
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/authOptions';
import { ok, fail } from '@/lib/api-response';
import { query } from '@/lib/db';

interface AuditLogEntry {
  id: number;
  expense_id: number;
  user_id: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE';
  old_values: any;
  new_values: any;
  summary: string | null;
  reason: string | null;
  entry_hash: string;
  created_at: string;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  const userId = (session.user as any).id as string;
  const { searchParams } = new URL(req.url);

  const limit = Math.min(Number(searchParams.get('limit')) || 50, 200);
  const offset = Number(searchParams.get('offset')) || 0;
  const search = searchParams.get('search') || '';
  const operation = searchParams.get('operation') || '';
  const startDate = searchParams.get('startDate') || '';
  const endDate = searchParams.get('endDate') || '';

  try {
    const conditions: string[] = ['eal.user_id = ?'];
    const args: any[] = [userId];

    if (search) {
      conditions.push('(eal.summary LIKE ? OR e.id = ?)');
      args.push(`%${search}%`, search);
    }

    if (operation && ['CREATE', 'UPDATE', 'DELETE', 'RESTORE'].includes(operation)) {
      conditions.push('eal.operation = ?');
      args.push(operation);
    }

    if (startDate) {
      conditions.push('DATE(eal.created_at) >= ?');
      args.push(startDate);
    }

    if (endDate) {
      conditions.push('DATE(eal.created_at) <= ?');
      args.push(endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const [countRow] = await query<{ total: number }[]>(
      `SELECT COUNT(*) as total
       FROM expense_audit_log eal
       LEFT JOIN expenses e ON eal.expense_id = e.id
       ${whereClause}`,
      args
    );
    const total = countRow?.total || 0;

    // Get paginated entries
    const entries = await query<AuditLogEntry[]>(
      `SELECT eal.*, e.description as expense_description
       FROM expense_audit_log eal
       LEFT JOIN expenses e ON eal.expense_id = e.id
       ${whereClause}
       ORDER BY eal.created_at DESC
       LIMIT ? OFFSET ?`,
      [...args, limit, offset]
    );

    // Parse JSON fields
    const parsed = entries.map(entry => ({
      ...entry,
      old_values: typeof entry.old_values === 'string' ? JSON.parse(entry.old_values) : entry.old_values,
      new_values: typeof entry.new_values === 'string' ? JSON.parse(entry.new_values) : entry.new_values,
    }));

    return ok({ entries: parsed, total });
  } catch (err: any) {
    console.error('[GET /api/expenses/audit]', err);
    return fail(err.message || 'Failed to fetch audit log.', 500);
  }
}
