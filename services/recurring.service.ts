import { query } from '@/lib/db';
import { ResultSetHeader } from 'mysql2';
import { todayIST, formatDateIST, parseDateIST, addMonthsIST } from '@/lib/time/time.service';

/**
 * processRecurringExpenses
 * Automatically iterates recurring expense templates inside the expenses table,
 * creating explicit duplicate expense entries matching today's date if next_recur_date is due!
 */
export async function processRecurringExpenses(userId: string): Promise<number> {
  const sql = `
    SELECT 
      id, user_id, amount_minor, category, description, recur_frequency, next_recur_date 
    FROM expenses 
    WHERE user_id = ? 
      AND is_recurring = 1 
      AND next_recur_date <= ?
  `;
  const rows = await query<any[]>(sql, [userId, formatDateIST(todayIST())]);

  let count = 0;
  for (const exp of rows) {
    let nextDate = parseDateIST(exp.next_recur_date);
    
    // 1. Insert NEW expense entry corresponding to Today
    await query(
      `INSERT INTO expenses (user_id, amount_minor, category, description, expense_date, is_recurring, created_at)
       VALUES (?, ?, ?, ?, ?, 0, NOW())`,
      [exp.user_id, exp.amount_minor, exp.category, `${exp.description} (Recurring)`, formatDateIST(todayIST())]
    );

    // 2. Compute future updated date adding Month/Year interval offsets
    if (exp.recur_frequency === 'monthly') {
      nextDate = addMonthsIST(nextDate, 1);
    } else if (exp.recur_frequency === 'yearly') {
      nextDate = addMonthsIST(nextDate, 12);
    }

    // 3. Update primary recurring templates pointers
    await query(
      `UPDATE expenses SET next_recur_date = ? WHERE id = ? AND user_id = ?`,
      [formatDateIST(nextDate), exp.id, userId]
    );
    count++;
  }

  return count;
}
