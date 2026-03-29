import pool, { query } from '@/lib/db';
import type {
  CreateExpenseInput,
  GetExpensesQuery,
  ExpenseDTO,
} from '@/types/api';
import { ResultSetHeader } from 'mysql2';

interface ExpenseRow {
  id:              string;
  user_id:         string;
  category_id:     number;
  category_name:   string;
  category_icon:   string;
  category_source: 'manual' | 'auto';
  amount:          string;
  expense_date:    string;
  description:     string;
  created_at:      string;
}

function toDTO(row: ExpenseRow): ExpenseDTO {
  return {
    id:           row.id,
    userId:       row.user_id,
    categoryId:   row.category_id,
    categoryName: row.category_name,
    categorySource: row.category_source,
    categoryIcon: row.category_icon || '📌',
    amount:       parseFloat(row.amount),
    date:         row.expense_date ? new Date(row.expense_date).toISOString().slice(0, 10) : '',
    description:  row.description,
    createdAt:    row.created_at,
  };
}

export async function listExpenses(params: GetExpensesQuery): Promise<ExpenseDTO[]> {
  const { userId, year, month, limit = 50 } = params;
  const safeLimit = Math.floor(Math.max(1, Math.min(200, Number(limit))));

  let sql = `
    SELECT
      e.id, e.user_id, e.amount, e.category_id, e.category_source, e.description, e.expense_date, e.created_at,
      c.name AS category_name, c.icon AS category_icon
    FROM expenses e
    JOIN categories c ON e.category_id = c.id
    WHERE e.user_id = ?
  `;
  const args: (string | number)[] = [String(userId)];

  if (year)  { sql += ' AND YEAR(expense_date) = ?';  args.push(Number(year));  }
  if (month) { sql += ' AND MONTH(expense_date) = ?'; args.push(Number(month)); }

  sql += ` ORDER BY expense_date DESC, created_at DESC LIMIT ${safeLimit}`;

  const [rows] = await pool.execute<any[]>(sql, args);
  return (rows as ExpenseRow[]).map(toDTO);
}

export async function createExpense(input: any): Promise<ExpenseDTO> {
  const { userId, categoryId, amount, date, description, categorySource = 'manual' } = input;

  const result = await query<ResultSetHeader>(
    `INSERT INTO expenses (user_id, amount, category_id, category_source, description, expense_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [userId, amount, categoryId, categorySource, description, date],
  );

  const [row] = await query<ExpenseRow[]>(
    `SELECT e.*, c.name AS category_name, c.icon AS category_icon
     FROM expenses e
     JOIN categories c ON e.category_id = c.id
     WHERE e.id = ?`,
    [result.insertId],
  );

  return toDTO(row);
}

export async function monthlyExpenseSummary(
  userId: string,
  year: number,
  month: number,
): Promise<{ totalSpent: number; transactionCount: number; dailyAvg: number }> {
  interface SummaryRow {
    total_spent:       string;
    transaction_count: string;
    daily_avg:         string;
  }

  const [row] = await query<SummaryRow[]>(
    `SELECT
       COALESCE(SUM(amount), 0)                                            AS total_spent,
       COUNT(id)                                                            AS transaction_count,
       ROUND(COALESCE(SUM(amount), 0) / NULLIF(DAY(LAST_DAY(STR_TO_DATE(CONCAT(?, '-', LPAD(?, 2, '0'), '-01'), '%Y-%m-%d'))), 0), 2) AS daily_avg
     FROM expenses
     WHERE user_id = ?
       AND YEAR(expense_date)  = ?
       AND MONTH(expense_date) = ?`,
    [year, month, userId, year, month],
  );

  return {
    totalSpent:       parseFloat(row?.total_spent       || '0'),
    transactionCount: parseInt(row?.transaction_count   || '0', 10),
    dailyAvg:         parseFloat(row?.daily_avg         || '0'),
  };
}

export async function categoryWiseTotals(
  userId: string,
  year: number,
  month: number,
): Promise<{ categoryId: number; name: string; icon: string; total: number }[]> {
  interface CatRow {
    category_id: number;
    name:        string;
    icon:        string;
    total:       string;
  }

  const rows = await query<CatRow[]>(
    `SELECT
       e.category_id,
       c.name,
       c.icon,
       SUM(e.amount) AS total
     FROM expenses e
     JOIN categories c ON e.category_id = c.id
     WHERE e.user_id = ?
       AND YEAR(e.expense_date)  = ?
       AND MONTH(e.expense_date) = ?
     GROUP BY e.category_id, c.name, c.icon
     ORDER BY total DESC`,
    [userId, year, month],
  );

  return rows.map((r) => ({
    categoryId: r.category_id,
    name:       r.name,
    icon:       r.icon || '📌',
    total:      parseFloat(r.total || '0'),
  }));
}

export async function getMonthlyTrends(userId: string, months: number = 6): Promise<{ month_label: string; total_spent: string }[]> {
  const sql = `
    SELECT 
      DATE_FORMAT(expense_date, '%b %Y') as month_label,
      COALESCE(SUM(amount), 0) as total_spent
    FROM expenses 
    WHERE user_id = ?
      AND expense_date >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL ? MONTH), '%Y-%m-01')
    GROUP BY YEAR(expense_date), MONTH(expense_date), DATE_FORMAT(expense_date, '%b %Y')
    ORDER BY YEAR(expense_date) ASC, MONTH(expense_date) ASC
  `;
  return query<{ month_label: string; total_spent: string }[]>(sql, [userId, months]);
}
