/**
 * services/user.service.ts
 * ─────────────────────────────────────────────────────────────────────
 * All database logic for users (profiles, settings, income).
 */
import { query } from '@/lib/db';
import { ResultSetHeader } from 'mysql2';

export interface UserProfile {
  id: string;
  name: string | null;
  email: string;
  monthly_income: number;
  currency: string;
}

/**
 * getUserProfile
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const rows = await query<any[]>(
    `SELECT id, full_name AS name, email, monthly_income, COALESCE(currency_code, 'USD') AS currency FROM users WHERE id = ?`,
    [userId]
  );

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    id: row.id.toString(),
    name: row.name,
    email: row.email,
    monthly_income: parseFloat(row.monthly_income ?? '0'),
    currency: row.currency ?? 'USD',
  };
}

/**
 * updateUserProfile
 */
export async function updateUserProfile(userId: string, data: Partial<UserProfile>): Promise<boolean> {
  const updates: string[] = [];
  const values: any[] = [];

  if (data.name !== undefined) {
    updates.push('full_name = ?');
    values.push(data.name);
  }
  if (data.monthly_income !== undefined) {
    updates.push('monthly_income = ?');
    values.push(data.monthly_income);
  }
  if (data.currency !== undefined) {
    updates.push('currency_code = ?');
    values.push(data.currency);
  }

  if (updates.length === 0) return true;

  const result = await query<ResultSetHeader>(
    `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
    [...values, userId]
  );


  return result.affectedRows > 0;
}
