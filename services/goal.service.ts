import { query } from '@/lib/db';
import type { GoalDTO } from '@/types/api';
import { Goals, Math as FinanceMath, Reports } from '@/lib/finance';
import { ResultSetHeader } from 'mysql2';

// ─── Row shape from DB ────────────────────────────────────────────────────────
// NOTE: Column is `saved_amount` in the DB, NOT `saved_amount`.
interface GoalRow {
  id:                     number;
  user_id:                string;
  title:                  string;
  description:            string | null;
  target_paise:           string;
  saved_paise:            string;
  target_date:            string;
  priority:               'low' | 'medium' | 'high';
  status:                 'active' | 'paused' | 'completed' | 'cancelled';
  goal_type:              'short_term' | 'long_term';
  created_at:             string;
}

function toDTO(row: GoalRow): GoalDTO {
  const targetPaise = Number(row.target_paise);
  const savedPaise  = Number(row.saved_paise);

  // We parse the target_date to compute days remaining dynamically if needed, but wait!
  // The DB query computes DATEDIFF(target_date, CURDATE()) AS days_remaining but I removed it from the GoalRow above. Let me add it back.
  // Wait, I will just compute it properly using FinanceCore or leave it.
  
  // Let's keep the DTO exactly as requested.
  const progressPct = Goals.calculateGoalProgress(savedPaise, targetPaise);
  const remainingPaise = Goals.calculateGoalRemaining(savedPaise, targetPaise);
  const isCompleted = Goals.isGoalCompleted(savedPaise, targetPaise);
  
  const targetDateISO = row.target_date ? new Date(row.target_date).toISOString() : new Date().toISOString();
  const status = Goals.calculateGoalStatus(savedPaise, targetPaise, targetDateISO);
  
  // To compute required monthly savings, we need months remaining.
  // Let's use days / 30 for months remaining as an approximation, or just compute exact months.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetDate = new Date(targetDateISO);
  targetDate.setHours(0, 0, 0, 0);
  const daysRemaining = Reports.clamp(Math.ceil((targetDate.getTime() - today.getTime()) / 86400000), 0, Infinity);
  const monthsRemaining = daysRemaining / 30; // approximate

  const requiredMonthlySavingsPaise = Goals.calculateRequiredMonthlySavings(
    remainingPaise,
    Reports.clamp(Math.round(monthsRemaining), 1, Infinity)
  );

  return {
    id:                   row.id,
    userId:               row.user_id,
    title:                row.title,
    description:          row.description || '',
    targetAmountPaise:    targetPaise,
    savedAmountPaise:     savedPaise,
    deadline:             targetDateISO.slice(0, 10),
    priority:             row.priority || 'medium',
    lifecycleStatus:      row.status || 'active',
    status:               status,
    goalType:             row.goal_type || 'short_term',
    completionPct:        Reports.roundPct(progressPct),
    daysRemaining:        daysRemaining,
    requiredDailySavingsPaise: daysRemaining > 0 ? Reports.roundPaise(remainingPaise / daysRemaining) : null,
    progressPct:          Reports.roundPct(progressPct),
    remainingPaise:       remainingPaise,
    isCompleted:          isCompleted,
    requiredMonthlySavingsPaise: requiredMonthlySavingsPaise,
    createdAt:            row.created_at,
  };
}

// Uses `saved_amount` — the actual column name in the goals table.
// Soft-deleted rows (deleted_at IS NOT NULL) are always excluded.
const BASE_SELECT = `
  SELECT
    id, user_id, title, description, target_paise, saved_paise,
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
  const { userId, title, description, targetPaise, deadline, priority, goalType = 'short_term' } = input;

  const result = await query<ResultSetHeader>(
    `INSERT INTO goals (user_id, title, description, target_paise, saved_paise, target_date, priority, status, goal_type)
     VALUES (?, ?, ?, ?, 0, ?, ?, 'active', ?)`,
    [userId, title, description || '', targetPaise, deadline, priority || 'medium', goalType],
  );

  const [row] = await query<GoalRow[]>(
    BASE_SELECT + ` AND id = ? AND user_id = ?`,
    [result.insertId, userId],
  );

  await logAuditEvent(userId, 'GOAL_CREATED', 'GOAL', result.insertId, { title, targetPaise });

  return toDTO(row);
}

export async function updateGoalProgress(
  goalId: number,
  userId: string,
  addAmountPaise: number,
): Promise<GoalDTO | null> {
  // WHERE includes user_id for strict isolation
  await query<ResultSetHeader>(
    `UPDATE goals
     SET
       saved_paise = LEAST(saved_paise + ?, target_paise),
       status = CASE
         WHEN LEAST(saved_paise + ?, target_paise) >= target_paise THEN 'completed'
         ELSE status
       END
     WHERE id = ? AND user_id = ? AND deleted_at IS NULL AND status NOT IN ('completed','cancelled')`,
    [addAmountPaise, addAmountPaise, goalId, userId],
  );

  const [row] = await query<GoalRow[]>(
    BASE_SELECT + ` AND id = ? AND user_id = ?`,
    [goalId, userId],
  );
  if (!row) return null;

  await logAuditEvent(userId, 'GOAL_DEPOSIT', 'GOAL', goalId, { addAmountPaise });
  return toDTO(row);
}

export async function updateGoal(
  goalId: number,
  userId: string,
  patch: { title?: string; description?: string; targetPaise?: number; deadline?: string; priority?: string; status?: string },
): Promise<GoalDTO | null> {
  const sets: string[] = [];
  const args: any[]    = [];

  if (patch.title        != null) { sets.push('title = ?');        args.push(patch.title); }
  if (patch.description  != null) { sets.push('description = ?');  args.push(patch.description); }
  if (patch.targetPaise  != null) { sets.push('target_paise = ?'); args.push(patch.targetPaise); }
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
       AND saved_paise < target_paise
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
    `SELECT target_paise, saved_paise
     FROM goals
     WHERE user_id = ? AND status = 'active' AND deleted_at IS NULL`,
    [userId]
  );
  
  if (!rows || rows.length === 0) return null;
  
  const totalProgress = rows.reduce((acc, row) => {
    const targetPaise = Number(row.target_paise);
    const savedPaise = Number(row.saved_paise);
    return acc + Goals.calculateGoalProgress(savedPaise, targetPaise);
  }, 0);
  
  // Use regular division, Analytics.calculateAverageSpend might be removed or specific
  return { progress: Reports.roundPaise(Reports.calculateAverageSpend(totalProgress, rows.length)) };
}
