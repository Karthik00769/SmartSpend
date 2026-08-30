/**
 * services/user.service.ts
 * ─────────────────────────────────────────────────────────────────────
 * All database logic for users (profiles, security, preferences).
 */
import { query } from '@/lib/db';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import bcrypt from 'bcryptjs';

export interface UserPreferences {
  budgetAlerts: boolean;
  aiInsights: boolean;
  weeklyDigest: boolean;
}

export interface UserProfile {
  id: string;
  name: string | null;
  email: string;
  monthlyIncomePaise: number;
  currency: string;
  timezone: string;
  twoFactorEnabled: boolean;
  preferences: UserPreferences;
  sessionVersion: number;
  avatar_url?: string | null;
}

/**
 * getUserProfile
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  // Fetch core fields first — always safe
  const rows = await query<any[]>(
    `SELECT 
        id, 
        full_name AS name, 
        email, 
        monthly_income_paise, 
        COALESCE(currency_code, 'USD') AS currency,
        two_factor_pin,
        preferences,
        session_version,
        avatar_url
     FROM users WHERE id = ? AND is_active = 1 AND deleted_at IS NULL`,
    [userId]
  );

  if (rows.length === 0) return null;

  // Fetch timezone separately — column may not exist if migration 011 hasn't run
  let timezone = 'Asia/Kolkata';
  try {
    const tzRows = await query<{ timezone: string }[]>(
      `SELECT COALESCE(timezone, 'Asia/Kolkata') AS timezone FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );
    if (tzRows[0]?.timezone) timezone = tzRows[0].timezone;
  } catch {
    // Column doesn't exist yet — use default
  }

  const row = rows[0];
  let prefs: UserPreferences = { budgetAlerts: true, aiInsights: true, weeklyDigest: false };
  
  if (row.preferences) {
    try {
      const parsed = typeof row.preferences === 'string' ? JSON.parse(row.preferences) : row.preferences;
      prefs = { ...prefs, ...parsed };
    } catch (e) {
      console.warn('Failed to parse preferences for user', userId, e);
    }
  }

  return {
    id: row.id.toString(),
    name: row.name,
    email: row.email,
    monthlyIncomePaise: Number(row.monthly_income_paise ?? 0),
    currency: row.currency ?? 'USD',
    timezone,
    twoFactorEnabled: !!row.two_factor_pin,
    preferences: prefs,
    sessionVersion: row.session_version || 1,
    avatar_url: row.avatar_url || null,
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
  if (data.email !== undefined) {
    updates.push('email = ?');
    values.push(data.email);
  }
  if (data.monthlyIncomePaise !== undefined) {
    updates.push('monthly_income_paise = ?');
    values.push(data.monthlyIncomePaise);
  }
  if (data.currency !== undefined) {
    updates.push('currency_code = ?');
    values.push(data.currency);
  }
  if ((data as any).timezone !== undefined) {
    // Only update timezone if the column exists (migration 011)
    try {
      await query<ResultSetHeader>(
        `UPDATE users SET timezone = ? WHERE id = ?`,
        [(data as any).timezone, userId]
      );
    } catch {
      // Column doesn't exist yet — skip silently
    }
  }
  if (data.preferences !== undefined) {
    updates.push('preferences = ?');
    values.push(JSON.stringify(data.preferences));
  }

  if (updates.length === 0) return true;

  const result = await query<ResultSetHeader>(
    `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
    [...values, userId]
  );

  return result.affectedRows > 0;
}

/**
 * updatePassword
 */
export async function updatePassword(userId: string, newPassword: string): Promise<boolean> {
  const hash = await bcrypt.hash(newPassword, 12); // Production-grade cost factor
  const result = await query<ResultSetHeader>(
    'UPDATE users SET password_hash = ? WHERE id = ?',
    [hash, userId]
  );
  return result.affectedRows > 0;
}

/**
 * verifyPassword
 */
export async function verifyPassword(userId: string, password: string): Promise<boolean> {
  const rows = await query<RowDataPacket[]>(
    'SELECT password_hash FROM users WHERE id = ?',
    [userId]
  );
  if (rows.length === 0 || !rows[0].password_hash) return false;
  return await bcrypt.compare(password, rows[0].password_hash);
}

/**
 * update2FAPin
 * PIN is now hashed using Bcrypt as requested.
 */
export async function update2FAPin(userId: string, pin: string | null): Promise<boolean> {
  const hashedPin = pin ? await bcrypt.hash(pin, 12) : null;
  const result = await query<ResultSetHeader>(
    'UPDATE users SET two_factor_pin = ? WHERE id = ?',
    [hashedPin, userId]
  );
  return result.affectedRows > 0;
}

/**
 * resetSessionVersion (Force Logout)
 */
export async function resetSessionVersion(userId: string): Promise<boolean> {
  const result = await query<ResultSetHeader>(
    'UPDATE users SET session_version = session_version + 1 WHERE id = ?',
    [userId]
  );
  return result.affectedRows > 0;
}

/**
 * deleteAccount (Soft Delete)
 * Flags the user as deleted and forcefully invalidates all active sessions.
 */
export async function deleteAccount(userId: string): Promise<boolean> {
  const result = await query<ResultSetHeader>(
    'UPDATE users SET deleted_at = NOW(), is_active = 0, session_version = session_version + 1 WHERE id = ?',
    [userId]
  );
  return result.affectedRows > 0;
}
