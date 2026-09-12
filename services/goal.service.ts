import { query } from '@/lib/db';
import type { GoalDTO } from '@/types/api';
import { Goals, Math as FinanceMath, Reports } from '@/lib/finance';
import { ResultSetHeader } from 'mysql2';

// ─── Row shape from DB ────────────────────────────────────────────────────────
interface GoalRow {
  id:          number;
  user_id:     string;
  title:       string;
  description: string | null;
  target_minor: string;
  saved_minor:  string;
  target_date:  string;
  priority:    'low' | 'medium' | 'high';
  status:      'active' | 'paused' | 'completed' | 'cancelled' | 'overdue';
  goal_type:   'short_term' | 'long_term';
  created_at:  string;
}

function toDTO(row: GoalRow): GoalDTO {
  const targetMinor = Number(row.target_minor);
  const savedMinor  = Number(row.saved_minor);

  const progressPct    = Goals.calculateGoalProgress(savedMinor, targetMinor);
  const remainingMinor = Goals.calculateGoalRemaining(savedMinor, targetMinor);
  const isCompleted    = Goals.isGoalCompleted(savedMinor, targetMinor);

  const targetDateISO = row.target_date
    ? new Date(row.target_date).toISOString()
    : new Date().toISOString();
  const status = Goals.calculateGoalStatus(savedMinor, targetMinor, targetDateISO);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetDate = new Date(targetDateISO);
  targetDate.setHours(0, 0, 0, 0);
  const daysRemaining = Reports.clamp(
    Math.ceil((targetDate.getTime() - today.getTime()) / 86400000),
    0,
    Infinity,
  );
  const monthsRemaining = daysRemaining / 30;

  const requiredMonthlySavingsMinor = Goals.calculateRequiredMonthlySavings(
    remainingMinor,
    Reports.clamp(Math.round(monthsRemaining), 1, Infinity),
  );

  return {
    id:                         row.id,
    userId:                     row.user_id,
    title:                      row.title,
    description:                row.description || '',
    targetAmountMinor:          targetMinor,
    savedAmountMinor:           savedMinor,
    deadline:                   targetDateISO.slice(0, 10),
    priority:                   row.priority || 'medium',
    lifecycleStatus:            row.status || 'active',
    status,
    goalType:                   row.goal_type || 'short_term',
    completionPct:              Reports.roundPct(progressPct),
    daysRemaining,
    requiredDailySavingsMinor:  daysRemaining > 0 ? Reports.roundMinor(remainingMinor / daysRemaining) : null,
    progressPct:                Reports.roundPct(progressPct),
    remainingMinor,
    isCompleted,
    requiredMonthlySavingsMinor,
    createdAt:                  row.created_at,
  };
}

const BASE_SELECT = `
  SELECT
    id, user_id, title, description, target_minor, saved_minor,
    target_date, priority, status, goal_type, created_at,
    DATEDIFF(target_date, CURDATE()) AS days_remaining
  FROM goals
  WHERE deleted_at IS NULL
`;

import { logAuditEvent } from './audit.service';

export async function listGoals(params: { userId: string; status?: string }): Promise<GoalDTO[]> {
  const { userId, status } = params;

  await syncGoalStatuses(userId);

  let sql  = BASE_SELECT + ` AND user_id = ?`;
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
  const { userId, title, description, targetMinor, deadline, priority, goalType = 'short_term' } = input;

  const [userRow] = await query<any[]>('SELECT currency_code FROM users WHERE id = ? LIMIT 1', [userId]);
  const currencyCode = userRow?.currency_code || 'INR';

  const result = await query<ResultSetHeader>(
    `INSERT INTO goals (user_id, title, description, target_minor, saved_minor, target_date, priority, status, goal_type, currency_code)
     VALUES (?, ?, ?, ?, 0, ?, ?, 'active', ?, ?)`,
    [userId, title, description || '', targetMinor, deadline, priority || 'medium', goalType, currencyCode],
  );

  const [row] = await query<GoalRow[]>(
    BASE_SELECT + ` AND id = ? AND user_id = ?`,
    [result.insertId, userId],
  );

  await logAuditEvent(userId, 'GOAL_CREATED', 'GOAL', result.insertId, { title, targetMinor });

  return toDTO(row);
}

export async function updateGoalProgress(
  goalId: number,
  userId: string,
  addAmountMinor: number,
): Promise<GoalDTO | null> {
  await query<ResultSetHeader>(
    `UPDATE goals
     SET
       saved_minor = LEAST(saved_minor + ?, target_minor),
       status = CASE
         WHEN LEAST(saved_minor + ?, target_minor) >= target_minor THEN 'completed'
         ELSE status
       END
     WHERE id = ? AND user_id = ? AND deleted_at IS NULL AND status NOT IN ('completed','cancelled')`,
    [addAmountMinor, addAmountMinor, goalId, userId],
  );

  const [row] = await query<GoalRow[]>(
    BASE_SELECT + ` AND id = ? AND user_id = ?`,
    [goalId, userId],
  );
  if (!row) return null;

  await logAuditEvent(userId, 'GOAL_DEPOSIT', 'GOAL', goalId, { addAmountMinor });
  return toDTO(row);
}

export async function updateGoal(
  goalId: number,
  userId: string,
  patch: { title?: string; description?: string; targetMinor?: number; deadline?: string; priority?: string; status?: string },
): Promise<GoalDTO | null> {
  const sets: string[] = [];
  const args: any[]    = [];

  if (patch.title       != null) { sets.push('title = ?');        args.push(patch.title); }
  if (patch.description != null) { sets.push('description = ?');  args.push(patch.description); }
  if (patch.targetMinor != null) { sets.push('target_minor = ?'); args.push(patch.targetMinor); }
  if (patch.deadline    != null) { sets.push('target_date = ?');   args.push(patch.deadline); }
  if (patch.priority    != null) { sets.push('priority = ?');      args.push(patch.priority); }
  if (patch.status      != null) { sets.push('status = ?');        args.push(patch.status); }

  if (sets.length === 0) throw new Error('Nothing to update.');

  // currency_code is not updated on patch unless specifically requested
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

/** Mark overdue active goals as overdue. Called before every list query. */
export async function syncGoalStatuses(userId: string): Promise<void> {
  await query(
    `UPDATE goals
     SET status = 'overdue'
     WHERE user_id = ?
       AND status = 'active'
       AND target_date < CURDATE()
       AND saved_minor < target_minor
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
    `SELECT target_minor, saved_minor
     FROM goals
     WHERE user_id = ? AND status = 'active' AND deleted_at IS NULL`,
    [userId]
  );

  if (!rows || rows.length === 0) return null;

  const totalProgress = rows.reduce((acc, row) => {
    const targetMinor = Number(row.target_minor);
    const savedMinor  = Number(row.saved_minor);
    return acc + Goals.calculateGoalProgress(savedMinor, targetMinor);
  }, 0);

  return { progress: Reports.roundMinor(Reports.calculateAverageSpend(totalProgress, rows.length)) };
}
