/**
 * lib/audit/audit-logger.ts
 * 
 * Centralized audit logging service for security and compliance.
 * Logs all security-sensitive operations to audit_logs table.
 */

import { query } from '@/lib/db';
import { ResultSetHeader } from 'mysql2';
import { NextRequest } from 'next/server';

export interface AuditLogParams {
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: any;
  req?: NextRequest;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Log an audit event
 * 
 * @param params - Audit log parameters
 * @returns Promise that resolves when log is written
 */
export async function logAudit(params: AuditLogParams): Promise<void> {
  const {
    userId,
    action,
    entityType,
    entityId,
    details = {},
    req,
    ipAddress,
    userAgent
  } = params;

  // Extract IP address from request or use provided value
  let ip = ipAddress;
  if (!ip && req) {
    ip = req.headers.get('x-forwarded-for') ||
         req.headers.get('x-real-ip') ||
         (req as any).ip ||
         'unknown';
    
    // x-forwarded-for may contain multiple IPs, take the first
    if (ip && typeof ip === 'string' && ip.includes(',')) {
      ip = ip.split(',')[0].trim();
    }
  }

  // Extract user agent from request or use provided value
  const ua = userAgent || req?.headers.get('user-agent') || 'unknown';

  try {
    await query<ResultSetHeader>(
      `INSERT INTO audit_logs 
       (user_id, action, entity_type, entity_id, details, ip_address, user_agent, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
      [
        userId,
        action,
        entityType,
        entityId,
        JSON.stringify(details),
        ip,
        ua
      ]
    );
  } catch (error) {
    // Log error but don't throw - audit logging should not break primary operations
    console.error('[AuditLogger] Failed to write audit log:', error);
    console.error('[AuditLogger] Attempted log:', {
      userId,
      action,
      entityType,
      entityId,
      details
    });
  }
}

/**
 * Log profile update
 */
export async function logProfileUpdate(
  userId: string,
  oldValues: any,
  newValues: any,
  changedFields: string[],
  req?: NextRequest
): Promise<void> {
  await logAudit({
    userId,
    action: 'profile_update',
    entityType: 'user',
    entityId: userId,
    details: {
      old_values: oldValues,
      new_values: newValues,
      changed_fields: changedFields
    },
    req
  });
}

/**
 * Log password change
 */
export async function logPasswordChange(
  userId: string,
  success: boolean,
  req?: NextRequest
): Promise<void> {
  await logAudit({
    userId,
    action: 'password_change',
    entityType: 'user',
    entityId: userId,
    details: { success },
    req
  });
}

/**
 * Log 2FA enable/disable
 */
export async function log2FAChange(
  userId: string,
  enabled: boolean,
  method: string,
  req?: NextRequest
): Promise<void> {
  await logAudit({
    userId,
    action: enabled ? '2fa_enabled' : '2fa_disabled',
    entityType: 'user',
    entityId: userId,
    details: { method },
    req
  });
}

/**
 * Log failed authorization attempt
 */
export async function logUnauthorizedAttempt(
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  reason: string,
  req?: NextRequest
): Promise<void> {
  await logAudit({
    userId,
    action: `unauthorized_${action}`,
    entityType,
    entityId,
    details: {
      reason,
      attempted_action: action
    },
    req
  });
}

/**
 * Log login attempt
 */
export async function logLoginAttempt(
  userId: string,
  success: boolean,
  reason?: string,
  req?: NextRequest
): Promise<void> {
  await logAudit({
    userId,
    action: success ? 'login_success' : 'login_failed',
    entityType: 'user',
    entityId: userId,
    details: {
      success,
      reason
    },
    req
  });
}

/**
 * Log logout
 */
export async function logLogout(
  userId: string,
  req?: NextRequest
): Promise<void> {
  await logAudit({
    userId,
    action: 'logout',
    entityType: 'user',
    entityId: userId,
    req
  });
}

/**
 * Log account deletion
 */
export async function logAccountDeletion(
  userId: string,
  reason: string,
  req?: NextRequest
): Promise<void> {
  await logAudit({
    userId,
    action: 'account_deleted',
    entityType: 'user',
    entityId: userId,
    details: { reason },
    req
  });
}

/**
 * Log session invalidation
 */
export async function logSessionInvalidation(
  userId: string,
  reason: string,
  req?: NextRequest
): Promise<void> {
  await logAudit({
    userId,
    action: 'session_invalidated',
    entityType: 'user',
    entityId: userId,
    details: { reason },
    req
  });
}

/**
 * Log email change
 */
export async function logEmailChange(
  userId: string,
  oldEmail: string,
  newEmail: string,
  req?: NextRequest
): Promise<void> {
  await logAudit({
    userId,
    action: 'email_changed',
    entityType: 'user',
    entityId: userId,
    details: {
      old_email: oldEmail,
      new_email: newEmail
    },
    req
  });
}

/**
 * Log security event
 */
export async function logSecurityEvent(
  userId: string,
  eventType: string,
  details: any,
  req?: NextRequest
): Promise<void> {
  await logAudit({
    userId,
    action: `security_event_${eventType}`,
    entityType: 'security',
    entityId: userId,
    details,
    req
  });
}
