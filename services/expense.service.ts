import pool, { query } from '@/lib/db';
import { Rules as FinanceRules, Core } from '@/lib/finance';
import type {
  GetExpensesQuery,
  ExpenseDTO,
  ExpenseCreateDTO,
} from '@/types/api';
import { ResultSetHeader } from 'mysql2';
import { getMonthBoundariesIST } from '@/lib/time/time.service';

interface ExpenseRow {
  id: string;
  user_id: string;
  category_id: number;
  category_name: string;
  category_icon: string;
  category_source: 'manual' | 'auto';
  source: string;
  amount_minor: string;
  expense_date: string;
  description: string;
  created_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
}

function toDTO(row: ExpenseRow): ExpenseDTO {
  return {
    id: row.id,
    userId: row.user_id,
    categoryId: row.category_id,
    categoryName: row.category_name || 'Uncategorized',
    categorySource: row.category_source,
    categoryIcon: row.category_icon || '📌',
    source: row.source || 'manual',
    amountMinor: Number(row.amount_minor),
    date: row.expense_date ? new Date(row.expense_date).toISOString().slice(0, 10) : '',
    description: row.description,
    createdAt: row.created_at,
    deletedAt: row.deleted_at || undefined,
  };
}

export async function listExpenses(params: GetExpensesQuery): Promise<ExpenseDTO[]> {
  const {
    userId, year, month, limit = 50, offset = 0,
    search, startDate, endDate, minAmountMinor, maxAmountMinor,
    source, categoryId: filterCategoryId,
  } = params as any;
  const safeLimit = Math.floor(Math.max(1, Math.min(500, Number(limit))));
  const safeOffset = Math.floor(Math.max(0, Number(offset || 0)));

  let sql = `
    SELECT
      e.id, e.user_id, e.amount_minor, e.category_id, e.category_source,
      e.source, e.description, e.expense_date, e.created_at,
      c.name AS category_name, c.icon AS category_icon
    FROM expenses e
    LEFT JOIN categories c ON e.category_id = c.id
    WHERE e.user_id    = ?
      AND e.deleted_at IS NULL
  `;
  const args: (string | number)[] = [String(userId)];

  // Replace YEAR/MONTH with date range filtering
  if (year && month) {
    const { startStr, endStr } = getMonthBoundariesIST(Number(year), Number(month));
    sql += ' AND e.expense_date >= ? AND e.expense_date < ?';
    args.push(startStr, endStr);
  } else if (year) {
    const { startStr: janStart } = getMonthBoundariesIST(Number(year), 1);
    const { endStr: decEnd } = getMonthBoundariesIST(Number(year), 12);
    sql += ' AND e.expense_date >= ? AND e.expense_date < ?';
    args.push(janStart, decEnd);
  }
  
  if (startDate) { sql += ' AND e.expense_date >= ?'; args.push(String(startDate)); }
  if (endDate) { sql += ' AND e.expense_date <= ?'; args.push(String(endDate)); }
  if (minAmountMinor) { sql += ' AND e.amount_minor >= ?'; args.push(Number(minAmountMinor)); }
  if (maxAmountMinor) { sql += ' AND e.amount_minor <= ?'; args.push(Number(maxAmountMinor)); }
  if (filterCategoryId) { sql += ' AND e.category_id = ?'; args.push(Number(filterCategoryId)); }
  if (source) { sql += ' AND e.source = ?'; args.push(String(source)); }
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
    minAmountMinor, maxAmountMinor, source, categoryId: filterCategoryId,
  } = params;

  let sql = `
    SELECT COUNT(*) AS total
    FROM expenses e
    LEFT JOIN categories c ON e.category_id = c.id
    WHERE e.user_id = ? AND e.deleted_at IS NULL
  `;
  const args: (string | number)[] = [String(userId)];

  // Replace YEAR/MONTH with date range filtering
  if (year && month) {
    const { startStr, endStr } = getMonthBoundariesIST(Number(year), Number(month));
    sql += ' AND e.expense_date >= ? AND e.expense_date < ?';
    args.push(startStr, endStr);
  } else if (year) {
    const { startStr: janStart } = getMonthBoundariesIST(Number(year), 1);
    const { endStr: decEnd } = getMonthBoundariesIST(Number(year), 12);
    sql += ' AND e.expense_date >= ? AND e.expense_date < ?';
    args.push(janStart, decEnd);
  }
  
  if (startDate) { sql += ' AND e.expense_date >= ?'; args.push(String(startDate)); }
  if (endDate) { sql += ' AND e.expense_date <= ?'; args.push(String(endDate)); }
  if (minAmountMinor) { sql += ' AND e.amount_minor >= ?'; args.push(Number(minAmountMinor)); }
  if (maxAmountMinor) { sql += ' AND e.amount_minor <= ?'; args.push(Number(maxAmountMinor)); }
  if (filterCategoryId) { sql += ' AND e.category_id = ?'; args.push(Number(filterCategoryId)); }
  if (source) { sql += ' AND e.source = ?'; args.push(String(source)); }
  if (search) {
    sql += ' AND (e.description LIKE ? OR c.name LIKE ?)';
    const like = `%${search}%`;
    args.push(like, like);
  }

  const [[row]] = await pool.execute<any[]>(sql, args);
  return Number(row?.total ?? 0);
}

export async function updateExpense(
  id: string,
  userId: string,
  patch: { amountMinor?: number; description?: string; categoryId?: number; date?: string },
): Promise<ExpenseDTO> {
  // 1. Get old values BEFORE update for audit trail
  const [oldRow] = await query<ExpenseRow[]>(
    `SELECT e.*, c.name AS category_name, c.icon AS category_icon
     FROM expenses e LEFT JOIN categories c ON e.category_id = c.id
     WHERE e.id = ? AND e.user_id = ? AND e.deleted_at IS NULL`,
    [id, userId],
  );
  
  if (!oldRow) throw new Error('Expense not found.');

  // 2. Check 24-hour immutability rule
  const createdAt = new Date(oldRow.created_at);
  const now = new Date();
  const hoursSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
  
  if (hoursSinceCreation > 24) {
    throw new Error('This expense is locked and can no longer be edited.');
  }

  const oldValues = {
    amount_minor: Number(oldRow.amount_minor),
    description: oldRow.description,
    category_id: oldRow.category_id,
    expense_date: oldRow.expense_date,
  };

  const sets: string[] = [];
  const args: (string | number)[] = [];
  const newValues: any = {};

  if (patch.amountMinor != null) { 
    sets.push('amount_minor = ?'); 
    args.push(patch.amountMinor); 
    newValues.amount_minor = patch.amountMinor;
  }
  if (patch.description != null) { 
    sets.push('description = ?'); 
    args.push(patch.description); 
    newValues.description = patch.description;
  }
  if (patch.categoryId != null) { 
    sets.push('category_id = ?'); 
    args.push(patch.categoryId); 
    newValues.category_id = patch.categoryId;
  }
  if (patch.date != null) { 
    sets.push('expense_date = ?'); 
    args.push(patch.date); 
    newValues.expense_date = patch.date;
  }

  if (sets.length === 0) throw new Error('Nothing to update.');

  sets.push('updated_at = NOW()');
  args.push(id, userId);

  // 3. Log to expense_audit_log BEFORE making changes (LEDGER IMMUTABILITY)
  await logExpenseAudit(Number(id), userId, 'UPDATE', oldValues, newValues);

  // 4. Perform update
  await query<ResultSetHeader>(
    `UPDATE expenses SET ${sets.join(', ')} WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    args,
  );

  // 5. Get updated row
  const [row] = await query<ExpenseRow[]>(
    `SELECT e.*, c.name AS category_name, c.icon AS category_icon
     FROM expenses e LEFT JOIN categories c ON e.category_id = c.id
     WHERE e.id = ? AND e.user_id = ?`,
    [id, userId],
  );
  if (!row) throw new Error('Expense not found after update.');

  // 6. Log to general audit_logs
  await logAuditEvent(userId, 'EXPENSE_UPDATED', 'EXPENSE', Number(id), { oldValues, newValues });
  
  return toDTO(row);
}

export async function softDeleteExpense(id: string, userId: string, reason?: string): Promise<void> {
  // Get expense details before deletion for audit
  const [expense] = await query<ExpenseRow[]>(
    `SELECT * FROM expenses WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [id, userId]
  );
  
  if (!expense) throw new Error('Expense not found or already deleted.');

  const oldValues = {
    amount_minor: Number(expense.amount_minor),
    description: expense.description,
    category_id: expense.category_id,
    expense_date: expense.expense_date,
  };

  // Log to expense_audit_log
  await logExpenseAudit(Number(id), userId, 'DELETE', oldValues, null, reason);

  const result = await query<ResultSetHeader>(
    `UPDATE expenses 
     SET deleted_at = NOW(), deleted_by = ?, delete_reason = ?
     WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [userId, reason || null, id, userId],
  );
  
  if (result.affectedRows === 0) throw new Error('Expense not found or already deleted.');
  
  await logAuditEvent(userId, 'EXPENSE_DELETED', 'EXPENSE', Number(id), { reason });
}

/**
 * Restore soft-deleted expense
 */
export async function restoreExpense(id: string, userId: string): Promise<ExpenseDTO> {
  // Check if expense exists and is deleted
  const [expense] = await query<ExpenseRow[]>(
    `SELECT * FROM expenses WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL`,
    [id, userId]
  );
  
  if (!expense) throw new Error('Expense not found or not deleted.');

  const oldValues = {
    deleted_at: expense.deleted_at,
    deleted_by: expense.user_id,
  };

  // Log restore to expense_audit_log
  await logExpenseAudit(Number(id), userId, 'RESTORE', oldValues, { restored: true });

  // Restore the expense
  await query<ResultSetHeader>(
    `UPDATE expenses 
     SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, 
         restored_at = NOW(), restored_by = ?
     WHERE id = ? AND user_id = ?`,
    [userId, id, userId],
  );

  // Get restored expense
  const [row] = await query<ExpenseRow[]>(
    `SELECT e.*, c.name AS category_name, c.icon AS category_icon
     FROM expenses e LEFT JOIN categories c ON e.category_id = c.id
     WHERE e.id = ? AND e.user_id = ?`,
    [id, userId],
  );

  if (!row) throw new Error('Expense not found after restore.');

  await logAuditEvent(userId, 'EXPENSE_RESTORED', 'EXPENSE', Number(id), {});
  
  return toDTO(row);
}

/**
 * Log expense audit trail entry
 */
async function logExpenseAudit(
  expenseId: number,
  userId: string,
  operation: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE',
  oldValues: any | null,
  newValues: any | null,
  reason?: string
): Promise<void> {
  const crypto = require('crypto');
  
  // Get previous hash for this expense
  const [lastLog] = await query<{ entry_hash: string }[]>(
    `SELECT entry_hash FROM expense_audit_log 
     WHERE expense_id = ? ORDER BY id DESC LIMIT 1`,
    [expenseId]
  );
  
  const previousHash = lastLog?.entry_hash || '0'.repeat(64);
  
  // Create payload for hashing
  const payload = JSON.stringify({
    expenseId,
    userId,
    operation,
    oldValues,
    newValues,
    timestamp: new Date().toISOString(),
  });

  const entryHash = crypto
    .createHash('sha256')
    .update(previousHash + payload)
    .digest('hex');

  // Create human-readable summary
  let summary = '';
  if (operation === 'UPDATE' && oldValues && newValues) {
    const changes: string[] = [];
    for (const key in newValues) {
      if (oldValues[key] !== newValues[key]) {
        changes.push(`${key}: ${oldValues[key]} → ${newValues[key]}`);
      }
    }
    summary = changes.join('; ');
  } else if (operation === 'DELETE') {
    summary = `Expense deleted: ${oldValues?.description || 'N/A'}`;
  } else if (operation === 'CREATE') {
    summary = `Expense created: ${newValues?.description || 'N/A'}`;
  } else if (operation === 'RESTORE') {
    summary = 'Expense restored from deleted state';
  }

  // Insert audit log
  await query(
    `INSERT INTO expense_audit_log 
     (expense_id, user_id, operation, old_values, new_values, changes_summary, 
      changed_by, previous_hash, entry_hash, reason, sequence_no)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 
       (SELECT COALESCE(MAX(s.sequence_no), 0) + 1 FROM expense_audit_log s))`,
    [
      expenseId,
      userId,
      operation,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      summary,
      userId,
      previousHash,
      entryHash,
      reason || null,
    ]
  );
}

import { logAuditEvent } from './audit.service';

/**
 * findOrCreateCategory
 * Given a free-text category name from the user, find a matching category
 * (user-owned or system) or create a new user-scoped one.
 */
export async function findOrCreateCategory(
  userId: string,
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

  // 2. Partial match — system categories only
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

export async function createExpense(input: ExpenseCreateDTO): Promise<ExpenseDTO> {
  const { userId, categoryId, amountMinor, expenseDate, description, categorySource = 'manual', currencyCode = 'INR' } = input;

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

  // Duplicate guard — check last 60 seconds
  const recentExpenses = await query<any[]>(
    `SELECT id, amount_minor, DATE_FORMAT(expense_date, '%Y-%m-%d') as expense_date, description FROM expenses
     WHERE user_id = ?
       AND deleted_at IS NULL
       AND created_at >= DATE_SUB(NOW(), INTERVAL 60 SECOND)
     ORDER BY created_at DESC`,
    [userId],
  );

  const safeRecentExpenses = Array.isArray(recentExpenses) ? recentExpenses : [];
  for (const recent of safeRecentExpenses) {
    if (FinanceRules.isDuplicateExpense(
      amountMinor, expenseDate, description ?? '',
      Number(recent.amount_minor), recent.expense_date, recent.description ?? '',
    )) {
      throw new Error('Duplicate expense: an identical entry was just saved. Please wait a moment before retrying.');
    }
  }

  // If DTO doesn't provide it or just provides 'INR' blindly, we should verify user's true currency
  let finalCurrencyCode = currencyCode;
  if (!finalCurrencyCode || finalCurrencyCode === 'INR') {
    const [userRow] = await query<any[]>(
      `SELECT currency_code FROM users WHERE id = ?`,
      [userId]
    );
    finalCurrencyCode = userRow?.currency_code || 'INR';
  }

  const payloadToLog = { userId, amountMinor, categoryId, categorySource, source, description, expenseDate, currencyCode: finalCurrencyCode };
  console.log('[Expense Service] Creating expense with payload:', JSON.stringify(payloadToLog, null, 2));

  const result = await query<ResultSetHeader>(
    `INSERT INTO expenses (user_id, amount_minor, category_id, category_source, source, description, expense_date, currency_code, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [userId, amountMinor, categoryId, categorySource, source, description, expenseDate, finalCurrencyCode],
  );

  const [row] = await query<ExpenseRow[]>(
    `SELECT e.*, c.name AS category_name, c.icon AS category_icon
     FROM expenses e
     JOIN categories c ON e.category_id = c.id
     WHERE e.id = ?`,
    [result.insertId],
  );

  await logAuditEvent(userId, 'EXPENSE_ADDED', 'EXPENSE', result.insertId, { amountMinor, categoryId, expenseDate, description });
  
  // Log to expense_audit_log for immutable trail
  await logExpenseAudit(result.insertId, userId, 'CREATE', null, { amountMinor, categoryId, expenseDate, description, source, categorySource });

  return toDTO(row);
}

export async function monthlyExpenseSummary(
  userId: string,
  year: number,
  month: number,
): Promise<{ totalSpentMinor: number; transactionCount: number; dailyAvgMinor: number; savingsRate: number; incomeMinor: number; savingsMinor: number; incomeSpentPct: number }> {
  interface SummaryRow {
    total_spent_minor: string;
    transaction_count: string;
    daily_avg_minor: string;
  }

  const { startStr, endStr } = getMonthBoundariesIST(year, month);
  const daysInMonth = new Date(year, month, 0).getDate();

  const [row] = await query<SummaryRow[]>(
    `SELECT
       COALESCE(SUM(amount_minor), 0) AS total_spent_minor,
       COUNT(id) AS transaction_count,
       ROUND(COALESCE(SUM(amount_minor), 0) / ?, 0) AS daily_avg_minor
     FROM expenses
     WHERE user_id = ?
       AND deleted_at IS NULL
       AND expense_date >= ?
       AND expense_date < ?`,
    [daysInMonth, userId, startStr, endStr],
  );

  // Get user's monthly income for savings rate calculation
  const [userRow] = await query<{ monthly_income_minor: string }[]>(
    `SELECT monthly_income_minor FROM users WHERE id = ? LIMIT 1`,
    [userId],
  );
  const monthlyIncomeMinor = Number(userRow?.monthly_income_minor ?? 0);
  const totalSpentMinor = parseInt(row?.total_spent_minor || '0', 10);

  // Use canonical savings rate formula
  const savingsRate = Core.calculateSavingsRate(monthlyIncomeMinor, totalSpentMinor);
  const savingsMinor = Core.calculateSavings(monthlyIncomeMinor, totalSpentMinor);
  const incomeSpentPct = Core.calculateCategoryPercentage(totalSpentMinor, monthlyIncomeMinor);

  return {
    totalSpentMinor,
    transactionCount: parseInt(row?.transaction_count || '0', 10),
    dailyAvgMinor: parseInt(row?.daily_avg_minor || '0', 10),
    savingsRate,
    incomeMinor: monthlyIncomeMinor,
    savingsMinor,
    incomeSpentPct,
  };
}

export async function periodExpenseSummary(
  userId: string,
  startStr: string,
  endStr: string,
): Promise<{ totalSpentMinor: number; transactionCount: number }> {
  interface SummaryRow {
    total_spent_minor: string;
    transaction_count: string;
  }

  const [row] = await query<SummaryRow[]>(
    `SELECT
       COALESCE(SUM(amount_minor), 0) AS total_spent_minor,
       COUNT(id) AS transaction_count
     FROM expenses
     WHERE user_id = ?
       AND deleted_at IS NULL
       AND expense_date >= ?
       AND expense_date <= ?`,
    [userId, startStr, endStr],
  );

  return {
    totalSpentMinor: parseInt(row?.total_spent_minor || '0', 10),
    transactionCount: parseInt(row?.transaction_count || '0', 10),
  };
}

export async function categoryWiseTotals(
  userId: string,
  year: number,
  month: number,
): Promise<{ categoryId: number; name: string; icon: string; totalMinor: number }[]> {
  interface CatRow {
    category_id: number;
    name: string;
    icon: string;
    total: string;
  }

  const { startStr, endStr } = getMonthBoundariesIST(year, month);

  const rows = await query<CatRow[]>(
    `SELECT
       e.category_id,
       c.name,
       c.icon,
       SUM(e.amount_minor) AS total
     FROM expenses e
     JOIN categories c ON e.category_id = c.id
     WHERE e.user_id = ?
       AND e.deleted_at IS NULL
       AND e.expense_date >= ?
       AND e.expense_date < ?
     GROUP BY e.category_id, c.name, c.icon
     ORDER BY total DESC`,
    [userId, startStr, endStr],
  );

  return rows.map((r) => ({
    categoryId: r.category_id,
    name: r.name,
    icon: r.icon || '📌',
    totalMinor: parseInt(r.total || '0', 10),
  }));
}

export async function getMonthlyTrends(userId: string, months = 6): Promise<{ month_label: string; total_spent_minor: string }[]> {
  // Calculate start date for N months ago in IST
  const { currentMonthIST, currentYearIST } = await import('@/lib/time/time.service');
  const currentMonth = currentMonthIST();
  const currentYear = currentYearIST();
  
  let startYear = currentYear;
  let startMonth = currentMonth - months + 1;
  
  if (startMonth <= 0) {
    startYear = currentYear - 1;
    startMonth = 12 + startMonth;
  }
  
  const { startStr } = getMonthBoundariesIST(startYear, startMonth);

  const sql = `
    SELECT
      YEAR(expense_date) AS year_val,
      MONTH(expense_date) AS month_val,
      COALESCE(SUM(amount_minor), 0)     AS total_spent_minor
    FROM expenses
    WHERE user_id    = ?
      AND deleted_at IS NULL
      AND expense_date >= ?
    GROUP BY YEAR(expense_date), MONTH(expense_date)
    ORDER BY year_val ASC, month_val ASC
  `;
  
  const rows = await query<{ year_val: number; month_val: number; total_spent_minor: string }[]>(sql, [userId, startStr]);
  
  return rows.map(r => {
    const d = new Date(r.year_val, r.month_val - 1, 1);
    const monthStr = d.toLocaleString('en-US', { month: 'short' });
    return {
      month_label: `${monthStr} ${r.year_val}`,
      total_spent_minor: r.total_spent_minor
    };
  });
}

export async function getCategorySpendingWithBudgets(
  userId: string,
  year: number,
  month: number,
): Promise<{ category: string; total_spent: string; limit_amount: string }[]> {
  const { startStr: monthStart, endStr: monthEnd } = getMonthBoundariesIST(year, month);
  
  return query<any[]>(`
    SELECT
      COALESCE(c.name, bc.name)                        AS category,
      COALESCE(SUM(e.amount_minor), 0)                 AS total_spent,
      COALESCE(b.limit_minor, 0)                       AS limit_amount
    FROM (
      SELECT DISTINCT category_id FROM expenses WHERE user_id = ? AND expense_date >= ? AND expense_date < ? AND deleted_at IS NULL
      UNION
      SELECT DISTINCT category_id FROM budgets WHERE user_id = ? AND year = ? AND month = ? AND deleted_at IS NULL
    ) as cats
    LEFT JOIN expenses e ON e.category_id = cats.category_id AND e.user_id = ? AND e.expense_date >= ? AND e.expense_date < ? AND e.deleted_at IS NULL
    LEFT JOIN budgets b ON b.category_id = cats.category_id AND b.user_id = ? AND b.year = ? AND b.month = ? AND b.deleted_at IS NULL
    LEFT JOIN categories c ON e.category_id = c.id
    LEFT JOIN categories bc ON b.category_id = bc.id
    GROUP BY COALESCE(c.name, bc.name), b.limit_minor
    ORDER BY total_spent DESC
  `, [userId, monthStart, monthEnd, userId, year, month, userId, monthStart, monthEnd, userId, year, month]);
}

export async function getDailyTrends(userId: string): Promise<{ date: string; total: string }[]> {
  const rows = await query<{ date_val: Date; total: string }[]>(`
    SELECT 
      expense_date AS date_val, 
      SUM(amount_minor) AS total
    FROM expenses
    WHERE user_id = ? AND deleted_at IS NULL
    GROUP BY expense_date
    ORDER BY expense_date ASC
  `, [userId]);

  return rows.map(r => {
    // Format date as YYYY-MM-DD
    const d = new Date(r.date_val);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return {
      date: `${yyyy}-${mm}-${dd}`,
      total: r.total
    };
  });
}

export async function getCategorySpend(
  userId: string,
  categoryId: number,
  year: number,
  month: number
): Promise<number> {
  const { startStr, endStr } = getMonthBoundariesIST(year, month);
  const [row] = await query<{ total_spent: string }[]>(`
    SELECT COALESCE(SUM(amount_minor), 0) AS total_spent
    FROM expenses
    WHERE user_id = ? 
      AND category_id = ? 
      AND expense_date >= ? 
      AND expense_date < ? 
      AND deleted_at IS NULL
  `, [userId, categoryId, startStr, endStr]);
  return parseInt(row?.total_spent || '0', 10);
}
