import { query } from '@/lib/db';
import type {
  GetBudgetsQuery,
  BudgetSummaryDTO,
  BudgetCategoryDTO,
} from '@/types/api';
import { Analytics, Budget, Math as FinanceMath } from '../lib/finance';

// budgets table columns: id, user_id, category_id, limit_amount, month, year,
//                        amount, created_at, updated_at, deleted_at
// NO budget_month / budget_year columns exist.

interface BudgetRow {
  id:           number;
  user_id:      string;
  category_id:  number;
  category:     string;
  icon:         string;
  color_hex:    string;
  limit_paise:  string;
  month:        number;
  year:         number;
  total_spent:  string;
}

function toDTO(row: BudgetRow): BudgetCategoryDTO {
  const allocatedPaise = Number(row.limit_paise || 0);
  const spentPaise     = Number(row.total_spent || 0);
  
  const usedPct = allocatedPaise > 0 ? Budget.calculateBudgetProgress(spentPaise, allocatedPaise) : null;

  return {
    id:           row.id,
    categoryId:   row.category_id,
    category:     row.category,
    icon:         row.icon || '📌',
    color:        row.color_hex || '#6B7280',
    allocatedPaise,
    spentPaise,
    usedPct:      usedPct ? Math.round(usedPct * 100) / 100 : null,
    isOverBudget: Budget.isBudgetExceeded(spentPaise, allocatedPaise),
    status:       Budget.calculateBudgetStatus(spentPaise, allocatedPaise),
    needsAlert:   Budget.needsBudgetAlert(spentPaise, allocatedPaise),
    remainingPaise: Budget.calculateRemainingBudget(spentPaise, allocatedPaise),
    month:        row.month,
    year:         row.year,
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
  const now   = new Date();
  const { userId, month = now.getMonth() + 1, year = now.getFullYear() } = params;

  const rows = await query<BudgetRow[]>(
    `SELECT
       b.id, b.user_id, b.category_id, b.limit_paise,
       b.month, b.year,
       c.name AS category, c.icon, c.color_hex,
       COALESCE(SUM(e.amount_paise), 0) AS total_spent
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
       b.id, b.user_id, b.category_id, b.limit_paise, b.month, b.year,
       c.name, c.icon, c.color_hex
     ORDER BY total_spent DESC`,
    [userId, year, month],
  );

  const categories  = rows.map(toDTO);
  const totalBudgetPaise = categories.reduce((s, c) => s + c.allocatedPaise, 0);
  const totalSpentPaise  = categories.reduce((s, c) => s + c.spentPaise,     0);

  return { totalBudgetPaise, totalSpentPaise, categories };
}

export async function upsertBudget(input: any): Promise<BudgetSummaryDTO> {
  const { userId, categoryId, amountPaise, month, year } = input;

  // Ensure types are consistent (INT in DB)
  const catId   = parseInt(String(categoryId), 10);
  const userId_ = String(userId);

  if (isNaN(catId) || !amountPaise === undefined || !month || !year) {
    console.error(`[BUDGET] Validation failed: catId=${catId}, userId=${userId_}, month=${month}, year=${year}`);
    throw new Error(`Missing or invalid required fields: categoryId=${categoryId}, amountPaise=${amountPaise}`);
  }

  // 2. Validate: allow if user owns the category OR it is a system category
  const [catCheck] = await query<any[]>(
    `SELECT id, name, is_system FROM categories 
     WHERE id = ? AND (user_id = ? OR is_system = 1) AND deleted_at IS NULL`,
    [catId, userId_],
  );

  if (!catCheck) {
    console.error(`[BUDGET ERROR] Category check failed: userId=${userId_}, categoryId=${catId}. Category not found or unauthorized.`);
    throw new Error(`Category ${catId} not found or does not belong to this user.`);
  }

  // 3. Upsert: UNIQUE KEY (user_id, category_id, month, year)
  const result = await query(
    `INSERT INTO budgets (user_id, category_id, limit_paise, month, year, updated_at)
     VALUES (?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE 
       limit_paise = VALUES(limit_paise),
       updated_at   = NOW()`,
    [userId_, catId, Number(amountPaise), Number(month), Number(year)],
  );

  await logAuditEvent(userId_, 'BUDGET_UPDATED', 'BUDGET', catId, { amountPaise, month, year });

  return listBudgets({ userId: userId_, month: Number(month), year: Number(year) });
}

export async function getCategoryBudgetStatus(
  userId: string,
  categoryId: number,
  month: number,
  year: number
): Promise<{ limitPaise: number; spentPaise: number; percent: number; status: 'under' | 'near' | 'over' } | null> {
  const [row] = await query<any[]>(
    `SELECT 
       b.limit_paise,
       COALESCE(SUM(e.amount_paise), 0) AS total_spent
     FROM budgets b
     LEFT JOIN expenses e 
       ON e.category_id = b.category_id 
       AND e.user_id = b.user_id
       AND MONTH(e.expense_date) = b.month
       AND YEAR(e.expense_date) = b.year
       AND e.deleted_at IS NULL
     WHERE b.user_id = ? 
       AND b.category_id = ? 
       AND b.month = ? 
       AND b.year = ?
       AND b.deleted_at IS NULL
     GROUP BY b.id`,
    [userId, categoryId, month, year]
  );

  if (!row) return null;

  const limitPaise = Number(row.limit_paise);
  const spentPaise = Number(row.total_spent);
  
  const percent = Budget.calculateBudgetProgress(spentPaise, limitPaise);
  const coreStatus = Budget.calculateBudgetStatus(spentPaise, limitPaise);
  
  let status: 'under' | 'near' | 'over' = 'under';
  if (coreStatus === 'exceeded') status = 'over';
  else if (coreStatus === 'warning') status = 'near';

  return { limitPaise, spentPaise, percent, status };
}
