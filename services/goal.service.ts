import { query } from '@/lib/db';
import type { GoalDTO } from '@/types/api';
import { Analytics } from '../lib/finance';
import { ResultSetHeader } from 'mysql2';

// ─── Row shape from DB ────────────────────────────────────────────────────────
// NOTE: Column is `saved_amount` in the DB, NOT `saved_amount`.
interface GoalRow {
  id:                     number;
  user_id:                string;
  title:                  string;
  description:            string | null;
  target_amount:          string;
  saved_amount:           string;   // DB column name
  target_date:            string;
  priority:               'low' | 'medium' | 'high';
  status:                 'active' | 'paused' | 'completed' | 'cancelled';
  goal_type:              'short_term' | 'long_term';
  completion_pct:         string | null;
  days_remaining:         number;
  required_daily_savings: string | null;
  created_at:             string;
}

function toDTO(row: GoalRow): GoalDTO {
  const target = parseFloat(row.target_amount);
  const saved  = parseFloat(row.saved_amount);
  
  const completionPct = Analytics.calculateGoalProgressPct(saved, target);
  const requiredDailySavings = Analytics.calculateSpendingVelocity(target, saved, row.days_remaining);

  return {
    id:                   row.id,
    userId:               row.user_id,
    title:                row.title,
    description:          row.description || '',
    targetAmount:         target,
    savedAmount:          saved,   // expose as savedAmount in DTO
    deadline:             row.target_date ? new Date(row.target_date).toISOString().slice(0, 10) : '',
    priority:             row.priority || 'medium',
    status:               row.status   || 'active',
    goalType:             row.goal_type || 'short_term',
    completionPct:        Math.round(completionPct * 10) / 10,
    daysRemaining:        row.days_remaining,
    requiredDailySavings: requiredDailySavings > 0
      ? Math.round(requiredDailySavings * 100) / 100
      : null,
    createdAt:            row.created_at,
  };
}

// Uses `saved_amount` — the actual column name in the goals table.
// Soft-deleted rows (deleted_at IS NOT NULL) are always excluded.
const BASE_SELECT = `
  SELECT
    id, user_id, title, description, target_amount, saved_amount,
    target_date, priority, status, goal_type, created_at,
    NULL as completion_pct,
    DATEDIFF(target_date, CURDATE()) AS days_remaining,
    NULL AS required_daily_savings
  FROM goals
  WHERE deleted_at IS NULL
`;

import { logAuditEvent } from './audit.service';

export async function listGoals(params: { userId: string; status?: string }): Promise<GoalDTO[]> {
  const { userId, status } = params;

  // Auto-mark overdue goals as failed before returning
  await syncGoalStatuses(userId);

  let sql = BASE_SELECT + ` AND user_id = ?`;
  const args: any[] = [userId];

  if (status && status !== 'all') {
    sql += ` AND status = ?`;
    args.push(status);
  }

  sql += ` ORDER BY target_date ASC`;

  const rows = await query<GoalRow[]>(sql, args);
  return rows.map(toDTO);
}

export async function createGoal(input: any): Promise<GoalDTO> {
  const { userId, title, description, targetAmount, deadline, priority, goalType = 'short_term' } = input;

  const result = await query<ResultSetHeader>(
    `INSERT INTO goals (user_id, title, description, target_amount, saved_amount, target_date, priority, status, goal_type)
     VALUES (?, ?, ?, ?, 0.00, ?, ?, 'active', ?)`,
    [userId, title, description || '', targetAmount, deadline, priority || 'medium', goalType],
  );

  const [row] = await query<GoalRow[]>(
    BASE_SELECT + ` AND id = ? AND user_id = ?`,
    [result.insertId, userId],
  );

  await logAuditEvent(userId, 'GOAL_CREATED', 'GOAL', result.insertId, { title, targetAmount });

  return toDTO(row);
}

export async function updateGoalProgress(
  goalId: number,
  userId: string,
  addAmount: number,
): Promise<GoalDTO | null> {
  // WHERE includes user_id for strict isolation
  await query<ResultSetHeader>(
    `UPDATE goals
     SET
       saved_amount = LEAST(saved_amount + ?, target_amount),
       status = CASE
         WHEN LEAST(saved_amount + ?, target_amount) >= target_amount THEN 'completed'
         ELSE status
       END
     WHERE id = ? AND user_id = ? AND deleted_at IS NULL AND status NOT IN ('completed','cancelled')`,
    [addAmount, addAmount, goalId, userId],
  );

  const [row] = await query<GoalRow[]>(
    BASE_SELECT + ` AND id = ? AND user_id = ?`,
    [goalId, userId],
  );
  if (!row) return null;

  await logAuditEvent(userId, 'GOAL_DEPOSIT', 'GOAL', goalId, { addAmount });
  return toDTO(row);
}

export async function updateGoal(
  goalId: number,
  userId: string,
  patch: { title?: string; description?: string; targetAmount?: number; deadline?: string; priority?: string; status?: string },
): Promise<GoalDTO | null> {
  const sets: string[] = [];
  const args: any[]    = [];

  if (patch.title        != null) { sets.push('title = ?');        args.push(patch.title); }
  if (patch.description  != null) { sets.push('description = ?');  args.push(patch.description); }
  if (patch.targetAmount != null) { sets.push('target_amount = ?'); args.push(patch.targetAmount); }
  if (patch.deadline     != null) { sets.push('target_date = ?');   args.push(patch.deadline); }
  if (patch.priority     != null) { sets.push('priority = ?');      args.push(patch.priority); }
  if (patch.status       != null) { sets.push('status = ?');        args.push(patch.status); }

  if (sets.length === 0) throw new Error('Nothing to update.');

  sets.push('updated_at = NOW()');
  args.push(goalId, userId);

  await query<ResultSetHeader>(
    `UPDATE goals SET ${sets.join(', ')} WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    args,
  );

  const [row] = await query<GoalRow[]>(
    BASE_SELECT + ` AND id = ? AND user_id = ?`,
    [goalId, userId],
  );
  if (!row) return null;

  await logAuditEvent(userId, 'GOAL_UPDATED', 'GOAL', goalId, patch);
  return toDTO(row);
}

export async function softDeleteGoal(goalId: number, userId: string): Promise<void> {
  const result = await query<ResultSetHeader>(
    `UPDATE goals SET deleted_at = NOW() WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [goalId, userId],
  );
  if (result.affectedRows === 0) throw new Error('Goal not found or already deleted.');
  await logAuditEvent(userId, 'GOAL_DELETED', 'GOAL', goalId, {});
}

/** Mark overdue active goals as failed. Call on GET to keep statuses fresh. */
export async function syncGoalStatuses(userId: string): Promise<void> {
  await query(
    `UPDATE goals
     SET status = 'failed'
     WHERE user_id = ?
       AND status = 'active'
       AND target_date < CURDATE()
       AND saved_amount < target_amount
       AND deleted_at IS NULL`,
    [userId],
  );
}

export async function checkGoalUnlockStatus(userId: string): Promise<{ monthsOfData: number; longTermUnlocked: boolean }> {
  const [row] = await query<{ months_diff: number | null }[]>(`
    SELECT TIMESTAMPDIFF(MONTH, MIN(expense_date), CURDATE()) AS months_diff
    FROM expenses
    WHERE user_id = ? AND deleted_at IS NULL
  `, [userId]);

  const months = row?.months_diff ?? 0;
  return {
    monthsOfData:     months,
    longTermUnlocked: months >= 2,
  };
}

export async function getActiveGoalsProgress(userId: string): Promise<{ progress: number } | null> {
  const rows = await query<any[]>(
    `SELECT target_amount, saved_amount
     FROM goals
     WHERE user_id = ? AND status = 'active' AND deleted_at IS NULL`,
    [userId]
  );
  
  if (!rows || rows.length === 0) return null;
  
  const totalProgress = rows.reduce((acc, row) => {
    return acc + Analytics.calculateGoalProgressPct(parseFloat(row.saved_amount), parseFloat(row.target_amount));
  }, 0);
  
  return { progress: Math.round(Analytics.calculateAverageSpend(totalProgress, rows.length)) };
}
