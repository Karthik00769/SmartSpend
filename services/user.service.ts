/**
 * services/user.service.ts
 * ─────────────────────────────────────────────────────────────────────
 * All database logic for users (profiles, security, preferences).
 */
import { query, getConnection } from '@/lib/db';
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
  monthlyIncomeMinor: number;
  currency: string;
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
        monthly_income_minor, 
        COALESCE(currency_code, 'USD') AS currency,
        two_factor_pin,
        preferences,
        session_version,
        avatar_url
     FROM users WHERE id = ? AND is_active = 1 AND deleted_at IS NULL`,
    [userId]
  );

  if (rows.length === 0) return null;

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
    monthlyIncomeMinor: Number(row.monthly_income_minor ?? 0),
    currency: row.currency ?? 'USD',
    twoFactorEnabled: !!row.two_factor_pin,
    preferences: prefs,
    sessionVersion: row.session_version || 1,
    avatar_url: row.avatar_url || null,
  };
}

/**
 * updateUserProfile
 * 
 * Updates user profile with transaction safety and audit logging.
 * Captures old values, performs update, and logs changes atomically.
 */
export async function updateUserProfile(
  userId: string,
  data: Partial<UserProfile>,
  options?: { req?: any; skipAudit?: boolean }
): Promise<boolean> {
  const updates: string[] = [];
  const values: any[] = [];
  const changedFields: string[] = [];

  // Build update query
  if (data.name !== undefined) {
    updates.push('full_name = ?');
    values.push(data.name);
    changedFields.push('name');
  }
  if (data.email !== undefined) {
    updates.push('email = ?');
    values.push(data.email);
    changedFields.push('email');
  }
  if (data.monthlyIncomeMinor !== undefined) {
    updates.push('monthly_income_minor = ?');
    values.push(data.monthlyIncomeMinor);
    changedFields.push('monthly_income');
  }
  if (data.currency !== undefined) {
    updates.push('currency_code = ?');
    values.push(data.currency);
    changedFields.push('currency');
  }
  if (data.preferences !== undefined) {
    updates.push('preferences = ?');
    values.push(JSON.stringify(data.preferences));
    changedFields.push('preferences');
  }

  if (updates.length === 0) return true;

  // Get old values for audit trail
  const oldProfile = await getUserProfile(userId);
  if (!oldProfile && !options?.skipAudit) {
    console.warn('[updateUserProfile] User not found:', userId);
    return false;
  }

  // Transaction: profile update + audit log
  const connection = await getConnection();
  try {
    await connection.beginTransaction();

    // Execute profile update
    const [result] = await connection.query<ResultSetHeader>(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      [...values, userId]
    );

    // Insert audit log within transaction
    if (!options?.skipAudit && result.affectedRows > 0 && oldProfile) {
      const oldValues: any = {};
      const newValues: any = {};

      if (changedFields.includes('name')) {
        oldValues.name = oldProfile.name;
        newValues.name = data.name;
      }
      if (changedFields.includes('email')) {
        oldValues.email = oldProfile.email;
        newValues.email = data.email;
      }
      if (changedFields.includes('monthly_income')) {
        oldValues.monthly_income_minor = oldProfile.monthlyIncomeMinor;
        newValues.monthly_income_minor = data.monthlyIncomeMinor;
      }
      if (changedFields.includes('currency')) {
        oldValues.currency = oldProfile.currency;
        newValues.currency = data.currency;
      }
      if (changedFields.includes('preferences')) {
        oldValues.preferences = oldProfile.preferences;
        newValues.preferences = data.preferences;
      }

      await connection.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata, hash, sequence_no, created_at)
         VALUES (?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(s.sequence_no), 0) + 1 FROM audit_logs s), NOW())`,
        [
          userId,
          'PROFILE_UPDATED',
          'USER',
          userId,
          JSON.stringify({ oldValues, newValues, changedFields, ip: options?.req?.ip }),
          require('crypto').createHash('sha256').update(JSON.stringify({ userId, oldValues, newValues })).digest('hex')
        ]
      );
    }

    await connection.commit();
    return result.affectedRows > 0;
  } catch (error) {
    await connection.rollback();
    console.error('[updateUserProfile] Transaction failed:', error);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * updatePassword
 * 
 * Updates user password and invalidates all existing sessions.
 * Includes audit logging for security compliance.
 */
export async function updatePassword(
  userId: string,
  newPassword: string,
  options?: { req?: any; skipSessionInvalidation?: boolean }
): Promise<boolean> {
  const hash = await bcrypt.hash(newPassword, 12);
  
  const connection = await getConnection();
  try {
    await connection.beginTransaction();

    // Update password and session version
    const sessionVersionIncrement = options?.skipSessionInvalidation ? '' : ', session_version = session_version + 1';
    const [result] = await connection.query<ResultSetHeader>(
      `UPDATE users SET password_hash = ?${sessionVersionIncrement} WHERE id = ?`,
      [hash, userId]
    );

    // Insert audit logs within transaction
    if (result.affectedRows > 0) {
      await connection.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata, hash, sequence_no, created_at)
         VALUES (?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(s.sequence_no), 0) + 1 FROM audit_logs s), NOW())`,
        [
          userId,
          'PASSWORD_CHANGED',
          'USER',
          userId,
          JSON.stringify({ success: true, ip: options?.req?.ip }),
          require('crypto').createHash('sha256').update(JSON.stringify({ userId, action: 'PASSWORD_CHANGED' })).digest('hex')
        ]
      );

      if (!options?.skipSessionInvalidation) {
        await connection.query(
          `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata, hash, sequence_no, created_at)
           VALUES (?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(s.sequence_no), 0) + 1 FROM audit_logs s), NOW())`,
          [
            userId,
            'SESSION_INVALIDATION',
            'USER',
            userId,
            JSON.stringify({ reason: 'password_changed', ip: options?.req?.ip }),
            require('crypto').createHash('sha256').update(JSON.stringify({ userId, action: 'SESSION_INVALIDATION' })).digest('hex')
          ]
        );
      }
    }

    await connection.commit();
    return result.affectedRows > 0;
  } catch (error) {
    await connection.rollback();
    console.error('[updatePassword] Transaction failed:', error);
    throw error;
  } finally {
    connection.release();
  }
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
 * Invalidates sessions when 2FA is disabled for security.
 */
export async function update2FAPin(
  userId: string,
  pin: string | null,
  options?: { req?: any; skipSessionInvalidation?: boolean }
): Promise<boolean> {
  const hashedPin = pin ? await bcrypt.hash(pin, 12) : null;
  
  const shouldInvalidateSessions = !pin && !options?.skipSessionInvalidation;
  
  const connection = await getConnection();
  try {
    await connection.beginTransaction();

    // Update 2FA PIN and session version
    const sessionVersionIncrement = shouldInvalidateSessions ? ', session_version = session_version + 1' : '';
    const [result] = await connection.query<ResultSetHeader>(
      `UPDATE users SET two_factor_pin = ?${sessionVersionIncrement} WHERE id = ?`,
      [hashedPin, userId]
    );

    // Insert audit logs within transaction
    if (result.affectedRows > 0) {
      await connection.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata, hash, sequence_no, created_at)
         VALUES (?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(s.sequence_no), 0) + 1 FROM audit_logs s), NOW())`,
        [
          userId,
          '2FA_CHANGED',
          'USER',
          userId,
          JSON.stringify({ enabled: !!pin, method: 'pin', ip: options?.req?.ip }),
          require('crypto').createHash('sha256').update(JSON.stringify({ userId, action: '2FA_CHANGED', enabled: !!pin })).digest('hex')
        ]
      );

      if (shouldInvalidateSessions) {
        await connection.query(
          `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata, hash, sequence_no, created_at)
           VALUES (?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(s.sequence_no), 0) + 1 FROM audit_logs s), NOW())`,
          [
            userId,
            'SESSION_INVALIDATION',
            'USER',
            userId,
            JSON.stringify({ reason: '2fa_disabled', ip: options?.req?.ip }),
            require('crypto').createHash('sha256').update(JSON.stringify({ userId, action: 'SESSION_INVALIDATION' })).digest('hex')
          ]
        );
      }
    }

    await connection.commit();
    return result.affectedRows > 0;
  } catch (error) {
    await connection.rollback();
    console.error('[update2FAPin] Transaction failed:', error);
    throw error;
  } finally {
    connection.release();
  }
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
