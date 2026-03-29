import { query } from '@/lib/db';
import type { GoalDTO } from '@/types/api';
import { ResultSetHeader } from 'mysql2';

interface GoalRow {
  id:                     number;
  user_id:                string;
  title:                  string;
  description:            string | null;
  target_amount:          string;
  current_amount:         string;
  target_date:            string;
  priority:               'low' | 'medium' | 'high';
  status:                 'active' | 'paused' | 'completed' | 'cancelled';
  completion_pct:         string;
  days_remaining:         number;
  required_daily_savings: string | null;
  created_at:             string;
}

function toDTO(row: GoalRow): GoalDTO {
  return {
    id:                   row.id,
    userId:               row.user_id,
    title:                row.title,
    description:          row.description || '',
    targetAmount:         parseFloat(row.target_amount),
    currentAmount:        parseFloat(row.current_amount),
    deadline:             row.target_date ? new Date(row.target_date).toISOString().slice(0, 10) : '',
    priority:             row.priority || 'medium',
    status:               row.status   || 'active',
    completionPct:        parseFloat(row.completion_pct || '0'),
    daysRemaining:        row.days_remaining,
    requiredDailySavings: row.required_daily_savings
      ? parseFloat(row.required_daily_savings)
      : null,
    createdAt:            row.created_at,
  };
}

const BASE_SELECT = `
  SELECT
    id, user_id, title, description, target_amount, current_amount,
    target_date, priority, status, created_at,
    ROUND((current_amount / NULLIF(target_amount, 0)) * 100, 1) AS completion_pct,
    DATEDIFF(target_date, CURDATE()) AS days_remaining,
    CASE
      WHEN DATEDIFF(target_date, CURDATE()) <= 0 THEN NULL
      ELSE ROUND(
        (target_amount - current_amount) / DATEDIFF(target_date, CURDATE()),
        2
      )
    END AS required_daily_savings
  FROM goals
`;

export async function listGoals(params: { userId: string; status?: string }): Promise<GoalDTO[]> {
  const { userId, status } = params;

  let sql = BASE_SELECT + `WHERE user_id = ?`;
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
  const { userId, title, description, targetAmount, deadline, priority } = input;

  const result = await query<ResultSetHeader>(
    `INSERT INTO goals (user_id, title, description, target_amount, target_date, priority, status)
     VALUES (?, ?, ?, ?, ?, ?, 'active')`,
    [userId, title, description || '', targetAmount, deadline, priority || 'medium'],
  );

  const [row] = await query<GoalRow[]>(
    BASE_SELECT + `WHERE id = ?`,
    [result.insertId],
  );

  return toDTO(row);
}

export async function updateGoalProgress(
  goalId: number,
  userId: string,
  addAmount: number,
): Promise<GoalDTO | null> {
  const updated = await query<ResultSetHeader>(
    `UPDATE goals
     SET current_amount = LEAST(current_amount + ?, target_amount)
     WHERE id = ? AND user_id = ?`,
    [addAmount, goalId, userId],
  );

  if (updated.affectedRows === 0) return null;

  const [row] = await query<GoalRow[]>(BASE_SELECT + `WHERE id = ?`, [goalId]);
  return toDTO(row);
}

export async function checkGoalUnlockStatus(userId: string): Promise<{ monthsOfData: number; longTermUnlocked: boolean }> {
  const [row] = await query<{ months_diff: number | null }[]>(`
    SELECT TIMESTAMPDIFF(MONTH, MIN(expense_date), CURDATE()) AS months_diff
    FROM expenses
    WHERE user_id = ?
  `, [userId]);

  const months = row?.months_diff ?? 0;
  return {
    monthsOfData:      months,
    longTermUnlocked:  months >= 2,
  };
}
