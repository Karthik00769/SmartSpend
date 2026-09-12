import { query } from '@/lib/db';
import type {
  GetBudgetsQuery,
  BudgetSummaryDTO,
  BudgetCategoryDTO,
} from '@/types/api';
import { Analytics, Budget, Math as FinanceMath } from '../lib/finance';

// ─── DB row shape ──────────────────────────────────────────────────────────────
interface BudgetRow {
  id:           number;
  user_id:      string;
  category_id:  number;
  category:     string;
  icon:         string;
  color_hex:    string;
  limit_minor:  string;
  month:        number;
  year:         number;
  total_spent:  string;
}

function toDTO(row: BudgetRow): BudgetCategoryDTO {
  const allocatedMinor = Number(row.limit_minor || 0);
  const spentMinor     = Number(row.total_spent || 0);

  const usedPct = allocatedMinor > 0
    ? Budget.calculateBudgetProgress(spentMinor, allocatedMinor)
    : null;

  return {
    id:             row.id,
    categoryId:     row.category_id,
    category:       row.category,
    icon:           row.icon || '📌',
    color:          row.color_hex || '#6B7280',
    allocatedMinor,
    spentMinor,
    usedPct:        usedPct ? Math.round(usedPct * 100) / 100 : null,
    isOverBudget:   Budget.isBudgetExceeded(spentMinor, allocatedMinor),
    status:         Budget.calculateBudgetStatus(spentMinor, allocatedMinor),
    needsAlert:     Budget.needsBudgetAlert(spentMinor, allocatedMinor),
    remainingMinor: Budget.calculateRemainingBudget(spentMinor, allocatedMinor),
    month:          row.month,
    year:           row.year,
  };
}

import { logAuditEvent } from './audit.service';

export async function deleteBudget(id: number, userId: string): Promise<void> {
  const result = await query<any>(
    `UPDATE budgets SET deleted_at = NOW()
     WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [id, userId],
  );
  if (result.affectedRows === 0) throw new Error('Budget not found or already deleted.');
  await logAuditEvent(userId, 'BUDGET_DELETED', 'BUDGET', id, {});
}

export async function listBudgets(params: GetBudgetsQuery): Promise<BudgetSummaryDTO> {
  const now  = new Date();
  const { userId, month = now.getMonth() + 1, year = now.getFullYear() } = params;

  const rows = await query<BudgetRow[]>(
    `SELECT
       b.id, b.user_id, b.category_id, b.limit_minor,
       b.month, b.year,
       c.name AS category, c.icon, c.color_hex,
       COALESCE(SUM(e.amount_minor), 0) AS total_spent
     FROM budgets b
     JOIN categories c ON b.category_id = c.id
     LEFT JOIN expenses e
       ON  e.category_id = b.category_id
       AND e.user_id     = b.user_id
       AND YEAR(e.expense_date)  = b.year
       AND MONTH(e.expense_date) = b.month
       AND e.deleted_at IS NULL
     WHERE b.user_id    = ?
       AND b.year       = ?
       AND b.month      = ?
       AND b.deleted_at IS NULL
     GROUP BY
       b.id, b.user_id, b.category_id, b.limit_minor, b.month, b.year,
       c.name, c.icon, c.color_hex
     ORDER BY total_spent DESC`,
    [userId, year, month],
  );

  const categories     = rows.map(toDTO);
  const totalBudgetMinor = categories.reduce((s, c) => s + c.allocatedMinor, 0);
  const totalSpentMinor  = categories.reduce((s, c) => s + c.spentMinor,     0);

  return { totalBudgetMinor, totalSpentMinor, categories };
}

export async function upsertBudget(input: any): Promise<BudgetSummaryDTO> {
  const { userId, categoryId, amountMinor, month, year } = input;

  const catId   = parseInt(String(categoryId), 10);
  const userId_ = String(userId);

  if (isNaN(catId) || amountMinor == null || !month || !year) {
    throw new Error(`Missing or invalid required fields: categoryId=${categoryId}, amountMinor=${amountMinor}`);
  }

  // Verify category ownership
  const [catCheck] = await query<any[]>(
    `SELECT id, name, is_system FROM categories
     WHERE id = ? AND (user_id = ? OR is_system = 1) AND deleted_at IS NULL`,
    [catId, userId_],
  );

  if (!catCheck) {
    throw new Error(`Category ${catId} not found or does not belong to this user.`);
  }

  const [userRow] = await query<any[]>('SELECT currency_code FROM users WHERE id = ? LIMIT 1', [userId_]);
  const currencyCode = userRow?.currency_code || 'INR';

  // Upsert with UNIQUE KEY (user_id, category_id, month, year)
  await query(
    `INSERT INTO budgets (user_id, category_id, limit_minor, month, year, updated_at, currency_code)
     VALUES (?, ?, ?, ?, ?, NOW(), ?)
     ON DUPLICATE KEY UPDATE
       limit_minor = VALUES(limit_minor),
       currency_code = ?,
       updated_at  = NOW()`,
    [userId_, catId, Number(amountMinor), Number(month), Number(year), currencyCode, currencyCode],
  );

  await logAuditEvent(userId_, 'BUDGET_UPDATED', 'BUDGET', catId, { amountMinor, month, year });

  return listBudgets({ userId: userId_, month: Number(month), year: Number(year) });
}

export async function getCategoryBudgetStatus(
  userId:     string,
  categoryId: number,
  month:      number,
  year:       number,
): Promise<{ limitMinor: number; spentMinor: number; percent: number; status: 'under' | 'near' | 'over' } | null> {
  const [row] = await query<any[]>(
    `SELECT
       b.limit_minor,
       COALESCE(SUM(e.amount_minor), 0) AS total_spent
     FROM budgets b
     LEFT JOIN expenses e
       ON e.category_id = b.category_id
       AND e.user_id    = b.user_id
       AND MONTH(e.expense_date) = b.month
       AND YEAR(e.expense_date)  = b.year
       AND e.deleted_at IS NULL
     WHERE b.user_id    = ?
       AND b.category_id = ?
       AND b.month      = ?
       AND b.year       = ?
       AND b.deleted_at IS NULL
     GROUP BY b.id`,
    [userId, categoryId, month, year],
  );

  if (!row) return null;

  const limitMinor = Number(row.limit_minor);
  const spentMinor = Number(row.total_spent);

  const percent    = Budget.calculateBudgetProgress(spentMinor, limitMinor);
  const coreStatus = Budget.calculateBudgetStatus(spentMinor, limitMinor);

  let status: 'under' | 'near' | 'over' = 'under';
  if (coreStatus === 'exceeded') status = 'over';
  else if (coreStatus === 'warning') status = 'near';

  return { limitMinor, spentMinor, percent, status };
}
