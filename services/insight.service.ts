import { query } from '@/lib/db';
import type {
  GetInsightsQuery,
  InsightDTO,
  InsightsSummaryDTO,
  InsightType,
} from '@/types/api';
import { Analytics } from '@/lib/finance';

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
      content,
      metadata, is_read,
      generated_for_month, generated_for_year, created_at,
      TIMESTAMPDIFF(MINUTE, created_at, NOW()) AS minutes_ago
    FROM insights
    WHERE user_id = ?
      AND created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
      AND content != ''
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
  // Derive insights from real DB data — no hardcoded strings
  interface SpendRow { total_spent: string; prev_spent: string; }
  interface CatRow   { name: string; total: string; }
  interface IncRow   { monthly_income_paise: string; }

  const [spendRows, catRows, incRows] = await Promise.all([
    // Current vs previous month spend
    query<SpendRow[]>(`
      SELECT
        COALESCE(SUM(CASE WHEN MONTH(expense_date)=? AND YEAR(expense_date)=? THEN amount_paise END), 0) AS total_spent,
        COALESCE(SUM(CASE WHEN MONTH(expense_date)=? AND YEAR(expense_date)=? THEN amount_paise END), 0) AS prev_spent
      FROM expenses
      WHERE user_id = ? AND deleted_at IS NULL
    `, [month, year,
        month === 1 ? 12 : month - 1, month === 1 ? year - 1 : year,
        userId]),
    // Top category this month
    query<CatRow[]>(`
      SELECT c.name, SUM(e.amount_paise) AS total
      FROM expenses e
      LEFT JOIN categories c ON e.category_id = c.id
      WHERE e.user_id = ? AND MONTH(e.expense_date) = ? AND YEAR(e.expense_date) = ? AND e.deleted_at IS NULL
      GROUP BY c.name ORDER BY total DESC LIMIT 1
    `, [userId, month, year]),
    query<IncRow[]>(`SELECT monthly_income_paise FROM users WHERE id = ? LIMIT 1`, [userId]),
  ]);

  const totalSpentPaise = Number(spendRows[0]?.total_spent ?? 0);
  const prevSpentPaise  = Number(spendRows[0]?.prev_spent  ?? 0);
  const incomePaise     = Number(incRows[0]?.monthly_income_paise ?? 0);
  const topCat          = catRows[0]?.name ?? null;
  const topCatAmtPaise  = Number(catRows[0]?.total ?? 0);

  const insights: { type: string; content: string }[] = [];

  // 1. Month-over-month comparison
  if (prevSpentPaise > 0 && totalSpentPaise > prevSpentPaise * 1.1) {
    const pct = Math.round(Analytics.calculateGrowthPct(totalSpentPaise, prevSpentPaise));
    insights.push({
      type:    'overspending_alert',
      content: `Your spending increased by ${pct}% compared to last month (${(totalSpentPaise/100).toFixed(2)} vs ${(prevSpentPaise/100).toFixed(2)}).`,
    });
  } else if (prevSpentPaise > 0 && totalSpentPaise < prevSpentPaise * 0.9) {
    const pct = Math.abs(Math.round(Analytics.calculateGrowthPct(totalSpentPaise, prevSpentPaise)));
    insights.push({
      type:    'savings_opportunity',
      content: `Great progress — your spending dropped by ${pct}% compared to last month.`,
    });
  }

  // 2. Top category
  if (topCat && totalSpentPaise > 0) {
    const pct = Math.round(Analytics.calculateCategoryPct(topCatAmtPaise, totalSpentPaise));
    insights.push({
      type:    'monthly_summary',
      content: `Your top spending category this month is ${topCat} at ${(topCatAmtPaise/100).toFixed(2)} (${pct}% of total spend).`,
    });
  }

  // 3. Savings rate
  if (incomePaise > 0 && totalSpentPaise > 0) {
    const savingsRate = Math.round(Analytics.calculateSavingsRate(incomePaise, totalSpentPaise));
    if (savingsRate >= 20) {
      insights.push({
        type:    'savings_opportunity',
        content: `You saved ${savingsRate}% of your income this month. Keep it up!`,
      });
    } else if (totalSpentPaise > incomePaise) {
      const overspendRate = Math.round(Analytics.calculateGrowthPct(totalSpentPaise, incomePaise));
      insights.push({
        type:    'overspending_alert',
        content: `You spent ${overspendRate}% more than your monthly income this month. Review your expenses.`,
      });
    }
  }

  if (insights.length === 0) return 0;

  let inserted = 0;
  for (const ins of insights) {
    const result = await query<any>(
      `INSERT INTO insights (user_id, insight_type, content, metadata, generated_for_month, generated_for_year, created_at, is_read)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), 0)
       ON DUPLICATE KEY UPDATE content = VALUES(content), is_read = 0, created_at = NOW()`,
      [userId, ins.type, ins.content, JSON.stringify({ source: 'rule_based' }), month, year],
    );
    if (result.affectedRows >= 1) inserted++;
  }
  return inserted;
}
