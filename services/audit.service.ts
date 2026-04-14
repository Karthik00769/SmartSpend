import { query } from '@/lib/db';
import crypto from 'crypto';

export interface AuditLog {
  id: number;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: any;
  hash: string;
  created_at: string;
  is_valid?: boolean;
}

export async function logAuditEvent(
  userId: string,
  action: string,
  entityType: string,
  entityId: string | number | null,
  metadata: any = {}
) {
  // 1. Fetch previous hash for this user
  const [lastLog] = await query<{ hash: string }[]>(
    `SELECT hash FROM audit_logs WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
    [userId]
  );
  
  const previousHash = lastLog?.hash || '0'.repeat(64);
  
  // 2. Create payload for hashing
  const payload = JSON.stringify({
    userId,
    action,
    entityType,
    entityId: entityId?.toString() || null,
    metadata
  });

  const currentHash = crypto
    .createHash('sha256')
    .update(previousHash + payload)
    .digest('hex');

  // 3. Insert new log
  await query(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata, hash)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      userId,
      action,
      entityType,
      entityId?.toString() || null,
      JSON.stringify(metadata),
      currentHash
    ]
  );
}

export async function getAuditLogs(userId: string): Promise<AuditLog[]> {
  const logs = await query<any[]>(
    `SELECT * FROM audit_logs WHERE user_id = ? ORDER BY id DESC LIMIT 100`,
    [userId]
  );

  // Verification
  let expectedHash = '0'.repeat(64);
  const logsAsc = [...logs].reverse();
  
  for (const log of logsAsc) {
    const payload = JSON.stringify({
      userId: log.user_id,
      action: log.action,
      entityType: log.entity_type,
      entityId: log.entity_id,
      metadata: typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata
    });
    
    const computedHash = crypto
      .createHash('sha256')
      .update(expectedHash + payload)
      .digest('hex');
      
    log.is_valid = computedHash === log.hash;
    expectedHash = log.hash;
  }

  return logsAsc.reverse();
}
