import { query } from '@/lib/db';
import { ResultSetHeader } from 'mysql2';

/**
 * processRecurringExpenses
 * Automatically iterates recurring expense templates inside the expenses table,
 * creating explicit duplicate expense entries matching today's date if next_recur_date is due!
 */
export async function processRecurringExpenses(userId: string): Promise<number> {
  const sql = `
    SELECT 
      id, user_id, amount, category, description, recur_frequency, next_recur_date 
    FROM expenses 
    WHERE user_id = ? 
      AND is_recurring = 1 
      AND next_recur_date <= CURDATE()
  `;
  const rows = await query<any[]>(sql, [userId]);

  let count = 0;
  for (const exp of rows) {
    const nextDate = new Date(exp.next_recur_date);
    
    // 1. Insert NEW expense entry corresponding to Today
    await query(
      `INSERT INTO expenses (user_id, amount, category, description, expense_date, is_recurring, created_at)
       VALUES (?, ?, ?, ?, CURDATE(), 0, NOW())`,
      [exp.user_id, exp.amount, exp.category, `${exp.description} (Recurring)`]
    );

    // 2. Compute future updated date adding Month/Year interval offsets
    if (exp.recur_frequency === 'monthly') {
      nextDate.setMonth(nextDate.getMonth() + 1);
    } else if (exp.recur_frequency === 'yearly') {
      nextDate.setFullYear(nextDate.getFullYear() + 1);
    }

    // 3. Update primary recurring templates pointers
    await query(
      `UPDATE expenses SET next_recur_date = ? WHERE id = ?`,
      [nextDate.toISOString().slice(0, 10), exp.id]
    );
    count++;
  }

  return count;
}
