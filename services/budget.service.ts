import { query } from '@/lib/db';
import type {
  GetBudgetsQuery,
  BudgetSummaryDTO,
  BudgetCategoryDTO,
} from '@/types/api';

interface BudgetRow {
  id:           number;
  user_id:      string;
  category_id:  number;
  category:     string;
  icon:         string;
  color_hex:    string;
  limit_amount: string;
  budget_month: number;
  budget_year:  number;
  total_spent:  string;
}

function toDTO(row: BudgetRow): BudgetCategoryDTO {
  const allocated = parseFloat(row.limit_amount || '0');
  const spent     = parseFloat(row.total_spent  || '0');
  const usedPct   = allocated > 0 ? Math.round((spent / allocated) * 100 * 100) / 100 : null;

  return {
    id:           row.id,
    categoryId:   row.category_id,
    category:     row.category,
    icon:         row.icon || '📌',
    color:        row.color_hex || '#6B7280',
    allocated,
    spent,
    usedPct,
    isOverBudget: spent > allocated && allocated > 0,
    remaining:    allocated - spent,
    month:        row.budget_month,
    year:         row.budget_year,
  };
}

export async function listBudgets(params: GetBudgetsQuery): Promise<BudgetSummaryDTO> {
  const now   = new Date();
  const { userId, month = now.getMonth() + 1, year = now.getFullYear() } = params;

  const rows = await query<BudgetRow[]>(
    `SELECT
       b.id, b.user_id, b.category_id, b.limit_amount, b.budget_month, b.budget_year,
       c.name AS category, c.icon, c.color_hex,
       COALESCE(SUM(e.amount), 0) AS total_spent
     FROM budgets b
     JOIN categories c ON b.category_id = c.id
     LEFT JOIN expenses e
       ON  e.category_id = b.category_id
       AND e.user_id     = b.user_id
       AND YEAR(e.expense_date)  = b.budget_year
       AND MONTH(e.expense_date) = b.budget_month
     WHERE b.user_id      = ?
       AND b.budget_year  = ?
       AND b.budget_month = ?
     GROUP BY
       b.id, b.user_id, b.category_id, b.limit_amount, b.budget_month, b.budget_year,
       c.name, c.icon, c.color_hex
     ORDER BY total_spent DESC`,
    [userId, year, month],
  );

  const categories  = rows.map(toDTO);
  const totalBudget = categories.reduce((s, c) => s + c.allocated, 0);
  const totalSpent  = categories.reduce((s, c) => s + c.spent,     0);

  return { totalBudget, totalSpent, categories };
}

export async function upsertBudget(input: any): Promise<BudgetSummaryDTO> {
  const { userId, categoryId, amount, month, year } = input;

  await query(
    `INSERT INTO budgets (user_id, category_id, limit_amount, budget_month, budget_year)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE limit_amount = VALUES(limit_amount)`,
    [userId, categoryId, amount, month, year],
  );

  return listBudgets({ userId: userId as string, month, year });
}
