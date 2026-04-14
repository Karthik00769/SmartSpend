import { GoogleGenerativeAI } from '@google/generative-ai';

// ─── Input Types ─────────────────────────────────────────────────────────────

export interface UserFinancialData {
  monthlySpending: number;
  categoryDistribution: Record<string, number>;
  budgetUsage: Array<{ category: string; limit: number; spent: number }>;
  goalProgress: Array<{ title: string; target: number; current: number }>;
}

// ─── Output Types ────────────────────────────────────────────────────────────

export interface GeneratedInsight {
  type: 'warning' | 'opportunity' | 'trend';
  content: string;
}

// ─── Gemini model candidates (in priority order) ──────────────────────────────
// Older SDK versions use generateContent via getGenerativeModel().
// We try models in sequence and fall back gracefully if one 404s.
const MODEL_CANDIDATES = [
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-pro',
];

// ─── Rule-based fallback insights ────────────────────────────────────────────
/**
 * generateFallbackInsights
 * When the Gemini API is unavailable, derive insights directly from the
 * financial snapshot using deterministic rules. This guarantees the
 * dashboard always shows *something* meaningful.
 */
function generateFallbackInsights(data: UserFinancialData): GeneratedInsight[] {
  const insights: GeneratedInsight[] = [];

  // 1. Highest spending category
  const catEntries = Object.entries(data.categoryDistribution);
  if (catEntries.length > 0) {
    const [topCat, topAmount] = catEntries.sort((a, b) => b[1] - a[1])[0];
    const pct = data.monthlySpending > 0
      ? Math.round((topAmount / data.monthlySpending) * 100)
      : 0;
    insights.push({
      type: 'trend',
      content: `Your highest spending category this month is ${topCat} at $${topAmount.toFixed(2)} (${pct}% of total spend).`,
    });
  }

  // 2. Total monthly spend
  if (data.monthlySpending > 0) {
    insights.push({
      type: 'trend',
      content: `You've spent $${data.monthlySpending.toFixed(2)} total this month across ${catEntries.length} categories.`,
    });
  }

  // 3. Budget-exceeded categories
  const overBudget = data.budgetUsage.filter(b => b.limit > 0 && b.spent > b.limit);
  for (const b of overBudget.slice(0, 2)) {
    const over = b.spent - b.limit;
    insights.push({
      type: 'warning',
      content: `You've exceeded your ${b.category} budget by $${over.toFixed(2)} ($${b.spent.toFixed(2)} spent vs $${b.limit.toFixed(2)} limit). Consider reducing discretionary spending here.`,
    });
  }

  // 4. Near-limit categories (80-100%)
  const nearLimit = data.budgetUsage.filter(
    b => b.limit > 0 && b.spent <= b.limit && b.spent / b.limit >= 0.8
  );
  for (const b of nearLimit.slice(0, 1)) {
    const pct = Math.round((b.spent / b.limit) * 100);
    insights.push({
      type: 'warning',
      content: `You're at ${pct}% of your ${b.category} budget ($${b.spent.toFixed(2)} / $${b.limit.toFixed(2)}). Watch your spending to stay on track.`,
    });
  }

  // 5. Goal progress
  for (const g of data.goalProgress.slice(0, 1)) {
    if (g.target > 0 && g.current >= 0) {
      const pct = Math.round((g.current / g.target) * 100);
      insights.push({
        type: pct >= 75 ? 'opportunity' : 'trend',
        content: `Your "${g.title}" goal is ${pct}% complete ($${g.current.toFixed(2)} of $${g.target.toFixed(2)} saved). ${pct >= 75 ? 'Great work — you\'re almost there!' : 'Keep saving consistently to reach your target.'}`,
      });
    }
  }

  // 6. Savings opportunity when no budget set
  const unbudgeted = catEntries.filter(
    ([name]) => !data.budgetUsage.some(b => b.category === name)
  );
  if (unbudgeted.length > 0 && data.monthlySpending > 0) {
    insights.push({
      type: 'opportunity',
      content: `You have ${unbudgeted.length} spending categories without a budget. Setting limits for ${unbudgeted[0][0]} and others will help you control expenses and improve savings.`,
    });
  }

  // Always return at least one insight
  if (insights.length === 0) {
    insights.push({
      type: 'trend',
      content: 'Start adding expenses and budgets to unlock personalised financial insights tailored to your spending habits.',
    });
  }

  return insights;
}

// ─── AI Generator Function ───────────────────────────────────────────────────

/**
 * generateInsights
 * Attempts Gemini AI first; falls back to rule-based on any error.
 * Never returns an empty array — always provides at least one insight.
 */
export async function generateInsights(data: UserFinancialData): Promise<GeneratedInsight[]> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.warn('[insightGenerator] GEMINI_API_KEY not set — using rule-based fallback.');
    return generateFallbackInsights(data);
  }

  const prompt = `
    You are an expert financial advisor for the SmartSpend app.
    Analyze the following user financial data and generate 1 to 3 natural language insights.
    
    CRITICAL RULES:
    1. NEVER generate or include any numeric financial health scores or percentages (e.g., "Health Score: 85").
    2. NEVER invent mock statistics or data points not provided in the context.
    3. ONLY use natural language to explain trends, identification of risks (overspending), or goal progress.
    4. If the data is empty (no spending, no budgets), encourage the user to add transactions to unlock insights.
    5. Be professional, concise, and highly actionable.

    Data Context:
    - Monthly Spending: $${data.monthlySpending}
    - Category Breakdown: ${JSON.stringify(data.categoryDistribution)}
    - Budget Status: ${JSON.stringify(data.budgetUsage)}
    - Active Goals: ${JSON.stringify(data.goalProgress)}

    Output Format:
    Return as a clean JSON array with this structure:
    [
      {
        "type": "warning | opportunity | trend",
        "content": "Actionable explanation (e.g. 'You have spent more on dining than in previous weeks; consider cooking at home to save for your goals.')"
      }
    ]
  `;

  const genAI = new GoogleGenerativeAI(apiKey);

  // Try each model candidate in sequence
  for (const modelName of MODEL_CANDIDATES) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
        },
      });

      const responseText = result.response.text();
      const raw = JSON.parse(responseText);

      // Normalise — accept both a bare array and { insights: [...] }
      const arr: any[] = Array.isArray(raw) ? raw : (Array.isArray(raw?.insights) ? raw.insights : []);

      const valid = arr.filter(
        (i: any) => i?.content && ['warning', 'opportunity', 'trend'].includes(i?.type),
      ) as GeneratedInsight[];

      if (valid.length > 0) {
        console.log(`[insightGenerator] Generated ${valid.length} insights via ${modelName}`);
        return valid;
      }

      // Empty but no error → try next model
    } catch (err: any) {
      const is404 = err?.status === 404 || String(err?.message).includes('404') || String(err?.message).includes('not found');
      if (is404) {
        console.warn(`[insightGenerator] Model "${modelName}" not found — trying next candidate.`);
        continue; // try next model
      }
      // Non-404 error: log and break to fallback immediately
      console.error(`[insightGenerator] Gemini error with "${modelName}":`, err?.message ?? err);
      break;
    }
  }

  // All AI paths failed — use rule-based fallback
  console.warn('[insightGenerator] All Gemini models failed — using rule-based fallback.');
  return generateFallbackInsights(data);
}
