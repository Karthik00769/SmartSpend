import { query } from '@/lib/db';
import type {
  GetInsightsQuery,
  InsightDTO,
  InsightsSummaryDTO,
  InsightType,
} from '@/types/api';

interface InsightRow {
  id:                   number;
  user_id:              string;
  insight_type:         string;
  content:              string;
  metadata:             string | null;
  is_read:              number;
  generated_for_month:  number | null;
  generated_for_year:   number | null;
  created_at:           string;
  minutes_ago:          number;
}

function toDTO(row: InsightRow): InsightDTO {
  return {
    id:         row.id,
    type:       (row.insight_type && row.insight_type !== '') ? (row.insight_type as any) : 'monthly_summary',
    content:    row.content || '',
    metadata:   row.metadata ? (() => { try { return JSON.parse(row.metadata!); } catch { return null; } })() : null,
    isRead:     row.is_read === 1,
    month:      row.generated_for_month,
    year:       row.generated_for_year,
    createdAt:  row.created_at,
    minutesAgo: row.minutes_ago ?? 0,
  };
}

export async function fetchInsights(
  params: GetInsightsQuery,
): Promise<InsightsSummaryDTO> {
  const { userId, unreadOnly } = params;

  let sql = `
    SELECT
      id, user_id, insight_type,
      COALESCE(content, message, '') AS content,
      metadata, is_read,
      generated_for_month, generated_for_year, created_at,
      TIMESTAMPDIFF(MINUTE, created_at, NOW()) AS minutes_ago
    FROM insights
    WHERE user_id = ?
      AND created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
      AND COALESCE(content, message, '') != ''
  `;
  const args: any[] = [userId];

  if (unreadOnly) {
    sql += ` AND is_read = 0`;
  }

  sql += ` ORDER BY created_at DESC LIMIT 20`;

  const rows = await query<InsightRow[]>(sql, args);
  const unreadCount = rows.filter(r => r.is_read === 0).length;

  return {
    unreadCount,
    insights: rows.map(toDTO),
  };
}

export async function markAllRead(userId: string): Promise<number> {
  const result = await query<any>(
    `UPDATE insights SET is_read = 1 WHERE user_id = ? AND is_read = 0`,
    [userId],
  );
  return result.affectedRows ?? 0;
}

export async function generateMonthlyInsights(
  userId: string,
  month: number,
  year: number,
): Promise<number> {
  return 0;
}
