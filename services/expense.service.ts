import pool, { query } from '@/lib/db';
import { Rules as FinanceRules } from '@/lib/finance';
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
  source:          string;
  amount_paise:    string;
  expense_date:    string;
  description:     string;
  created_at:      string;
}

function toDTO(row: ExpenseRow): ExpenseDTO {
  return {
    id:             row.id,
    userId:         row.user_id,
    categoryId:     row.category_id,
    categoryName:   row.category_name   || 'Uncategorized',
    categorySource: row.category_source,
    categoryIcon:   row.category_icon   || '📌',
    source:         row.source          || 'manual',
    amountPaise:    Number(row.amount_paise),
    date:           row.expense_date ? new Date(row.expense_date).toISOString().slice(0, 10) : '',
    description:    row.description,
    createdAt:      row.created_at,
  };
}

export async function listExpenses(params: GetExpensesQuery): Promise<ExpenseDTO[]> {
  const {
    userId, year, month, limit = 50, offset = 0,
    search, startDate, endDate, minAmount, maxAmount,
    source, categoryId: filterCategoryId,
  } = params as any;
  const safeLimit  = Math.floor(Math.max(1, Math.min(500, Number(limit))));
  const safeOffset = Math.floor(Math.max(0, Number(offset || 0)));

  let sql = `
    SELECT
      e.id, e.user_id, e.amount_paise, e.category_id, e.category_source,
      e.source, e.description, e.expense_date, e.created_at,
      c.name AS category_name, c.icon AS category_icon
    FROM expenses e
    LEFT JOIN categories c ON e.category_id = c.id
    WHERE e.user_id    = ?
      AND e.deleted_at IS NULL
  `;
  const args: (string | number)[] = [String(userId)];

  if (year)             { sql += ' AND YEAR(e.expense_date) = ?';   args.push(Number(year));   }
  if (month)            { sql += ' AND MONTH(e.expense_date) = ?';  args.push(Number(month));  }
  if (startDate)        { sql += ' AND e.expense_date >= ?';        args.push(String(startDate)); }
  if (endDate)          { sql += ' AND e.expense_date <= ?';        args.push(String(endDate));   }
  if (minAmount)        { sql += ' AND e.amount_paise >= ?';              args.push(Number(minAmount)); }
  if (maxAmount)        { sql += ' AND e.amount_paise <= ?';              args.push(Number(maxAmount)); }
  if (filterCategoryId) { sql += ' AND e.category_id = ?';         args.push(Number(filterCategoryId)); }
  if (source)           { sql += ' AND e.source = ?';              args.push(String(source));   }
  if (search) {
    sql += ' AND (e.description LIKE ? OR c.name LIKE ?)';
    const like = `%${search}%`;
    args.push(like, like);
  }

  sql += ` ORDER BY e.expense_date DESC, e.created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`;

  const [rows] = await pool.execute<any[]>(sql, args);
  return (rows as ExpenseRow[]).map(toDTO);
}

export async function countExpenses(params: any): Promise<number> {
  const {
    userId, year, month, search, startDate, endDate,
    minAmount, maxAmount, source, categoryId: filterCategoryId,
  } = params;

  let sql = `
    SELECT COUNT(*) AS total
    FROM expenses e
    LEFT JOIN categories c ON e.category_id = c.id
    WHERE e.user_id = ? AND e.deleted_at IS NULL
  `;
  const args: (string | number)[] = [String(userId)];

  if (year)             { sql += ' AND YEAR(e.expense_date) = ?';   args.push(Number(year));   }
  if (month)            { sql += ' AND MONTH(e.expense_date) = ?';  args.push(Number(month));  }
  if (startDate)        { sql += ' AND e.expense_date >= ?';        args.push(String(startDate)); }
  if (endDate)          { sql += ' AND e.expense_date <= ?';        args.push(String(endDate));   }
  if (minAmount)        { sql += ' AND e.amount_paise >= ?';              args.push(Number(minAmount)); }
  if (maxAmount)        { sql += ' AND e.amount_paise <= ?';              args.push(Number(maxAmount)); }
  if (filterCategoryId) { sql += ' AND e.category_id = ?';         args.push(Number(filterCategoryId)); }
  if (source)           { sql += ' AND e.source = ?';              args.push(String(source));   }
  if (search) {
    sql += ' AND (e.description LIKE ? OR c.name LIKE ?)';
    const like = `%${search}%`;
    args.push(like, like);
  }

  const [[row]] = await pool.execute<any[]>(sql, args);
  return Number(row?.total ?? 0);
}

export async function updateExpense(
  id:     string,
  userId: string,
  patch:  { amountPaise?: number; description?: string; categoryId?: number; date?: string },
): Promise<ExpenseDTO> {
  const sets: string[] = [];
  const args: (string | number)[] = [];

  if (patch.amountPaise != null) { sets.push('amount_paise = ?');       args.push(patch.amountPaise); }
  if (patch.description != null) { sets.push('description = ?');  args.push(patch.description); }
  if (patch.categoryId  != null) { sets.push('category_id = ?');  args.push(patch.categoryId); }
  if (patch.date        != null) { sets.push('expense_date = ?'); args.push(patch.date); }

  if (sets.length === 0) throw new Error('Nothing to update.');

  sets.push('updated_at = NOW()');
  args.push(id, userId);

  await query<ResultSetHeader>(
    `UPDATE expenses SET ${sets.join(', ')} WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    args,
  );

  const [row] = await query<ExpenseRow[]>(
    `SELECT e.*, c.name AS category_name, c.icon AS category_icon
     FROM expenses e LEFT JOIN categories c ON e.category_id = c.id
     WHERE e.id = ? AND e.user_id = ?`,
    [id, userId],
  );
  if (!row) throw new Error('Expense not found after update.');

  await logAuditEvent(userId, 'EXPENSE_UPDATED', 'EXPENSE', Number(id), patch);
  return toDTO(row);
}

export async function softDeleteExpense(id: string, userId: string): Promise<void> {
  const result = await query<ResultSetHeader>(
    `UPDATE expenses SET deleted_at = NOW() WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [id, userId],
  );
  if (result.affectedRows === 0) throw new Error('Expense not found or already deleted.');
  await logAuditEvent(userId, 'EXPENSE_DELETED', 'EXPENSE', Number(id), {});
}

import { logAuditEvent } from './audit.service';

/**
 * findOrCreateCategory
 * Given a free-text category name from the user, find a matching category
 * (user-owned or system) or create a new user-scoped one.
 * Returns the resolved category id.
 */
export async function findOrCreateCategory(
  userId:       string,
  categoryName: string,
): Promise<number> {
  const name = categoryName.trim();

  // 1. Exact match — user's own categories first, then system
  const [existing] = await query<{ id: number }[]>(
    `SELECT id FROM categories
     WHERE (user_id = ? OR is_system = 1)
       AND LOWER(name) = LOWER(?)
     ORDER BY is_system ASC
     LIMIT 1`,
    [userId, name],
  );
  if (existing) return existing.id;

  // 2. Partial match — system categories only (avoid creating duplicates)
  const [partial] = await query<{ id: number }[]>(
    `SELECT id FROM categories
     WHERE is_system = 1
       AND (LOWER(name) LIKE LOWER(?) OR LOWER(?) LIKE CONCAT('%', LOWER(name), '%'))
     LIMIT 1`,
    [`%${name}%`, name],
  );
  if (partial) return partial.id;

  // 3. Create a new user-scoped category
  const result = await query<ResultSetHeader>(
    `INSERT INTO categories (user_id, name, icon, color_hex, is_system)
     VALUES (?, ?, '📌', '#6B7280', 0)`,
    [userId, name],
  );
  return result.insertId;
}

export async function createExpense(input: any): Promise<ExpenseDTO> {
  const { userId, categoryId, amountPaise, date, description, categorySource = 'manual' } = input;
  // Normalise source — guard against any value not in the DB ENUM
  const VALID_SOURCES = new Set(['manual', 'receipt_scan', 'bank_import']);
  const source: string = VALID_SOURCES.has(input.source) ? input.source : 'manual';

  if (categoryId != null) {
    const [catCheck] = await query<any[]>(
      `SELECT id FROM categories WHERE id = ? AND (user_id = ? OR is_system = 1) AND deleted_at IS NULL`,
      [categoryId, userId],
    );
    if (!catCheck) {
      throw new Error(`Category ${categoryId} not found or does not belong to this user.`);
    }
  }

  // ── Duplicate guard using FinanceCore ──
  const [recentExpenses] = await query<any[]>(
    `SELECT id, amount_paise, DATE_FORMAT(expense_date, '%Y-%m-%d') as expense_date, description FROM expenses
     WHERE user_id = ?
       AND deleted_at IS NULL
       AND created_at >= DATE_SUB(NOW(), INTERVAL 60 SECOND)
     ORDER BY created_at DESC`,
    [userId],
  );

  for (const recent of recentExpenses) {
    if (FinanceRules.isDuplicateExpense(
      amountPaise, date, description ?? '',
      Number(recent.amount_paise), recent.expense_date, recent.description ?? ''
    )) {
      throw new Error('Duplicate expense: an identical entry was just saved. Please wait a moment before retrying.');
    }
  }

  const result = await query<ResultSetHeader>(
    `INSERT INTO expenses (user_id, amount_paise, category_id, category_source, source, description, expense_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    [userId, amountPaise, categoryId, categorySource, source, description, date],
  );

  const [row] = await query<ExpenseRow[]>(
    `SELECT e.*, c.name AS category_name, c.icon AS category_icon
     FROM expenses e
     JOIN categories c ON e.category_id = c.id
     WHERE e.id = ?`,
    [result.insertId],
  );

  await logAuditEvent(userId, 'EXPENSE_ADDED', 'EXPENSE', result.insertId, { amountPaise, categoryId, date, description });

  return toDTO(row);
}

export async function monthlyExpenseSummary(
  userId: string,
  year: number,
  month: number,
): Promise<{ totalSpentPaise: number; transactionCount: number; dailyAvgPaise: number }> {
  interface SummaryRow {
    total_spent_paise:       string;
    transaction_count:       string;
    daily_avg_paise:         string;
  }

  const [row] = await query<SummaryRow[]>(
    `SELECT
       COALESCE(SUM(amount_paise), 0)                                       AS total_spent_paise,
       COUNT(id)                                                            AS transaction_count,
       ROUND(COALESCE(SUM(amount_paise), 0) / NULLIF(DAY(LAST_DAY(STR_TO_DATE(CONCAT(?, '-', LPAD(?, 2, '0'), '-01'), '%Y-%m-%d'))), 0), 0) AS daily_avg_paise
     FROM expenses
     WHERE user_id    = ?
       AND deleted_at IS NULL
       AND YEAR(expense_date)  = ?
       AND MONTH(expense_date) = ?`,
    [year, month, userId, year, month],
  );

  return {
    totalSpentPaise:  parseInt(row?.total_spent_paise || '0', 10),
    transactionCount: parseInt(row?.transaction_count || '0', 10),
    dailyAvgPaise:    parseInt(row?.daily_avg_paise   || '0', 10),
  };
}

export async function categoryWiseTotals(
  userId: string,
  year: number,
  month: number,
): Promise<{ categoryId: number; name: string; icon: string; totalPaise: number }[]> {
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
       SUM(e.amount_paise) AS total
     FROM expenses e
     JOIN categories c ON e.category_id = c.id
     WHERE e.user_id    = ?
       AND e.deleted_at IS NULL
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
    totalPaise: parseInt(r.total || '0', 10),
  }));
}

export async function getMonthlyTrends(userId: string, months: number = 6): Promise<{ month_label: string; total_spent_paise: string }[]> {
  // GROUP BY uses only YEAR/MONTH (DATE_FORMAT is functionally dependent on them).
  // Avoids ONLY_FULL_GROUP_BY error in MySQL strict mode.
  const sql = `
    SELECT
      DATE_FORMAT(expense_date, '%b %Y') AS month_label,
      COALESCE(SUM(amount_paise), 0)     AS total_spent_paise
    FROM expenses
    WHERE user_id    = ?
      AND deleted_at IS NULL
      AND expense_date >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL ? MONTH), '%Y-%m-01')
    GROUP BY YEAR(expense_date), MONTH(expense_date), DATE_FORMAT(expense_date, '%b %Y')
    ORDER BY YEAR(expense_date) ASC, MONTH(expense_date) ASC
  `;
  return query<{ month_label: string; total_spent_paise: string }[]>(sql, [userId, months]);
}
