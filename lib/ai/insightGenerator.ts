import { GoogleGenerativeAI } from '@google/generative-ai';

// ─── Input Types ─────────────────────────────────────────────────────────────

export interface UserFinancialData {
  monthlySpending: number;
  categoryDistribution: Record<string, number>;
  budgetUsage: Array<{ category: string; limit: number; spent: number }>;
  goalProgress: Array<{ title: string; target: number; current: number }>;
  currencySymbol?: string; // e.g. '₹', '$', '£' — defaults to '₹'
  last3MonthsSpending?: number; // optional context for trend insights
  monthlyIncome?: number;
  savings?: number;
  savingsRate?: number;
  comparison?: { lastMonthSpend: number; changePercent: number };
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
  const sym = data.currencySymbol ?? '₹';

  // 1. Highest spending category
  const catEntries = Object.entries(data.categoryDistribution);
  if (catEntries.length > 0) {
    const [topCat, topAmount] = catEntries.sort((a, b) => b[1] - a[1])[0];
    const pct = data.monthlySpending > 0
      ? Math.round((topAmount / data.monthlySpending) * 100)
      : 0;
    insights.push({
      type: 'trend',
      content: `Your highest spending category this month is ${topCat} at ${sym}${topAmount.toFixed(0)} (${pct}% of total spend).`,
    });
  }

  // 2. Total monthly spend
  if (data.monthlySpending > 0) {
    insights.push({
      type: 'trend',
      content: `You've spent ${sym}${data.monthlySpending.toFixed(0)} total this month across ${catEntries.length} categories.`,
    });
  }

  // 3. Budget-exceeded categories
  const overBudget = data.budgetUsage.filter(b => b.limit > 0 && b.spent > b.limit);
  for (const b of overBudget.slice(0, 2)) {
    const over = b.spent - b.limit;
    insights.push({
      type: 'warning',
      content: `You've exceeded your ${b.category} budget by ${sym}${over.toFixed(0)} (${sym}${b.spent.toFixed(0)} spent vs ${sym}${b.limit.toFixed(0)} limit). Consider reducing discretionary spending here.`,
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
      content: `You're at ${pct}% of your ${b.category} budget (${sym}${b.spent.toFixed(0)} / ${sym}${b.limit.toFixed(0)}). Watch your spending to stay on track.`,
    });
  }

  // 5. Goal progress
  for (const g of data.goalProgress.slice(0, 1)) {
    if (g.target > 0 && g.current >= 0) {
      const pct = Math.round((g.current / g.target) * 100);
      insights.push({
        type: pct >= 75 ? 'opportunity' : 'trend',
        content: `Your "${g.title}" goal is ${pct}% complete (${sym}${g.current.toFixed(0)} of ${sym}${g.target.toFixed(0)} saved). ${pct >= 75 ? "Great work — you're almost there!" : 'Keep saving consistently to reach your target.'}`,
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

  const sym = data.currencySymbol ?? '₹';

  // Sort and pick top categories
  const topCategories = Object.entries(data.categoryDistribution)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);

  // Construct strict JSON input for Gemini
  const promptData = {
    currency: sym,
    monthlyIncome: data.monthlyIncome ?? 0,
    totalSpent: data.monthlySpending,
    savings: data.savings ?? 0,
    savingsRate: data.savingsRate ?? 0,
    topCategories,
    comparison: data.comparison ?? {
      lastMonthSpend: 0,
      changePercent: 0
    }
  };

  const prompt = `SYSTEM:

You are a financial advisor AI.

Give concise, actionable financial insights.

STRICT RULES:
* Use the given currency symbol ONLY
* Use real numbers from input
* DO NOT hallucinate data
* DO NOT generalize
* Keep insights practical and human-like
* Max 3–5 insights
* Understand regional and global contexts including India, US, Europe, and others. Recognize services like UPI, Swiggy, Zomato, Ola, Uber, Amazon, Flipkart, LIC, etc.

---
USER:

Analyze the financial data and provide:
1. Spending summary
2. Key warning (if any)
3. Opportunity to save
4. Specific recommendation

Data:
${JSON.stringify(promptData, null, 2)}

---
OUTPUT FORMAT (STRICT JSON ARRAY ONLY):
[
  {
    "type": "summary",
    "text": "..."
  },
  {
    "type": "warning",
    "text": "..."
  },
  {
    "type": "recommendation",
    "text": "..."
  }
]`;

  const genAI = new GoogleGenerativeAI(apiKey);

  for (const modelName of MODEL_CANDIDATES) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2, // Low randomness for strict adherence
        },
      });

      const responseText = result.response.text();
      const raw = JSON.parse(responseText);

      const arr: any[] = Array.isArray(raw) ? raw : (Array.isArray(raw?.insights) ? raw.insights : []);

      const valid = arr
        .filter((i: any) => typeof i?.text === 'string' && i.text.trim().length > 0)
        .map((i: any) => ({
          // Map Gemini's types back to our system's expected 'trend' | 'warning' | 'opportunity'
          type: (i.type === 'warning' ? 'warning' : i.type === 'opportunity' ? 'opportunity' : 'trend') as 'trend' | 'warning' | 'opportunity',
          content: i.text.trim()
        }));

      if (valid.length > 0) {
        console.log(`[insightGenerator] Generated ${valid.length} strictly formatted insights via ${modelName}`);
        
        // Ensure currency symbol enforcement
        const hasWrongCurrency = valid.some(v => v.content.includes('$') || v.content.includes('€') || v.content.includes('£'));
        if (sym === '₹' && (valid.some(v => v.content.includes('$')))) {
           // Basic replacement if the model ignored the strict instruction
           valid.forEach(v => v.content = v.content.replace(/\$/g, sym));
        }

        return valid;
      }
    } catch (err: any) {
      const is404 = err?.status === 404 || String(err?.message).includes('404') || String(err?.message).includes('not found');
      if (is404) {
        console.warn(`[insightGenerator] Model "${modelName}" not found — trying next.`);
        continue;
      }
      console.error(`[insightGenerator] Gemini error with "${modelName}":`, err?.message ?? err);
      break;
    }
  }

  console.warn('[insightGenerator] All Gemini models failed or returned empty data — using rule-based fallback.');
  return generateFallbackInsights(data);
}
