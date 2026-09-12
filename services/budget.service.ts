import { query } from '@/lib/db';
import {
  GetBudgetsQuery,
  BudgetSummaryDTO,
  BudgetCategoryDTO,
} from '@/types/api';
import { Analytics, Budget, Math as FinanceMath } from '../lib/finance';
import { getMonthBoundariesIST, currentMonthIST, currentYearIST } from '@/lib/time/time.service';
import { getCategorySpend, categoryWiseTotals } from '@/services/expense.service';

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
  const { userId, month = currentMonthIST(), year = currentYearIST() } = params;

  // 1. Fetch budgets for the user
  const budgetRows = await query<any[]>(
    `SELECT b.id, b.user_id, b.category_id, b.limit_minor, b.month, b.year, c.name AS category, c.icon, c.color_hex
     FROM budgets b
     JOIN categories c ON b.category_id = c.id
     WHERE b.user_id = ? AND b.year = ? AND b.month = ? AND b.deleted_at IS NULL`,
    [userId, year, month]
  );

  // 2. Fetch category-wise totals from expense service
  const categoriesSpent = await categoryWiseTotals(userId, year, month);
  const spentMap = new Map(categoriesSpent.map(c => [c.categoryId, c.totalMinor]));

  // 3. Merge
  const categories = budgetRows.map(b => {
    const spentMinor = spentMap.get(b.category_id) || 0;
    const limitMinor = Number(b.limit_minor);
    return {
      id: b.id,
      categoryId: b.category_id,
      category: b.category,
      icon: b.icon || '📌',
      color: b.color_hex || '#6B7280',
      allocatedMinor: limitMinor,
      spentMinor,
      month: b.month,
      year: b.year,
      usedPct: limitMinor > 0 ? Budget.calculateBudgetProgress(spentMinor, limitMinor) : null,
      isOverBudget: Budget.isBudgetExceeded(spentMinor, limitMinor),
      status: Budget.calculateBudgetStatus(spentMinor, limitMinor),
      needsAlert: Budget.needsBudgetAlert(spentMinor, limitMinor),
      remainingMinor: Budget.calculateRemainingBudget(spentMinor, limitMinor),
    };
  }).sort((a, b) => b.spentMinor - a.spentMinor);

  const totalBudgetMinor = categories.reduce((s, c) => s + c.allocatedMinor, 0);
  const totalSpentMinor  = categories.reduce((s, c) => s + c.spentMinor,     0);
  const totalRemainingMinor = Budget.calculateRemainingBudget(totalSpentMinor, totalBudgetMinor);

  return { totalBudgetMinor, totalSpentMinor, totalRemainingMinor, categories };
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
  const [bRow] = await query<any[]>(
    `SELECT limit_minor FROM budgets 
     WHERE user_id = ? AND category_id = ? AND month = ? AND year = ? AND deleted_at IS NULL`,
    [userId, categoryId, month, year]
  );

  if (!bRow) return null;

  const limitMinor = Number(bRow.limit_minor);
  const spentMinor = await getCategorySpend(userId, categoryId, year, month);

  const percent    = Budget.calculateBudgetProgress(spentMinor, limitMinor);
  const coreStatus = Budget.calculateBudgetStatus(spentMinor, limitMinor);

  let status: 'under' | 'near' | 'over' = 'under';
  if (coreStatus === 'exceeded') status = 'over';
  else if (coreStatus === 'warning') status = 'near';

  return { limitMinor, spentMinor, percent, status };
}
