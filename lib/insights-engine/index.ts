import type { InsightContextDTO, InsightsEngineOutput, TextAdvice } from '@/types/api';
import { AI_MODELS } from '@/lib/ai/models';

/**
 * runInsightsEngine
 * Orchestrates the conversion of InsightContextDTO into a full InsightsEngineOutput.
 * This function now only handles LLM prompting and TextAdvice generation,
 * delegating all financial math to FinanceCore via the InsightContextDTO.
 */
export async function runInsightsEngine(context: InsightContextDTO): Promise<InsightsEngineOutput> {
  const output: InsightsEngineOutput = {
    ...context,
    advice: [],
    aiSuggestions: null,
  };

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey || context.savingsAnalysis.incomeMinor <= 0) {
    return output;
  }

  try {
    const { topCategories, categoryTrends, anomalies, savingsAnalysis, score } = context;

    // AI suggestions prompt (general recommendations)
    const prompt = [
      `Analyze this user's spending behavior and provide a highly structured, actionable Executive Summary.`,
      `Your response must strictly include these exactly named sections:`,
      `1. Spending Analysis`,
      `2. Savings Analysis`,
      `3. Goal Analysis`,
      `4. Unusual Spending`,
      `5. One Action Recommendation`,
      ``,
      `Use plain text with clear spacing, NO markdown hashes or bold text.`,
      `Use INR (₹) formatting for all currency values, dividing minor units by 100 first.`,
      ``,
      `Income: ${context.savingsAnalysis.incomeMinor}`,
      `Total spent: ${context.savingsAnalysis.totalSpentMinor}`,
      `Savings rate: ${savingsAnalysis.savingsRate}% (${savingsAnalysis.classification})`,
      `Health score: ${score.overall}/100`,
      ``,
      `Top categories: ${topCategories.map(c => `${c.categoryName} ${c.percentageOfTotal}%`).join(', ')}`,
      ``,
      `Trends: ${categoryTrends.slice(0, 5).map(t => `${t.categoryName} ${t.trend} (${t.trendPct}%)`).join(', ')}`,
      ``,
      anomalies.length > 0
        ? `Anomalies: ${anomalies.map(a => a.message).join('; ')}`
        : `No spending anomalies detected.`,
      ``,
      context.goalProbabilities && context.goalProbabilities.length > 0
        ? `Goals: ${context.goalProbabilities.map(g => `${g.title}: ${g.risk} (${g.recommendation})`).join(' | ')}`
        : `No goals tracked.`
    ].join('\n');

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODELS.GEMINI_FLASH}:generateContent?key=${geminiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 800, temperature: 0.2 },
        }),
        signal: AbortSignal.timeout(8000),
      }
    );

    if (geminiRes.ok) {
      const geminiJson = await geminiRes.json();
      const text = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
      if (text) {
        output.aiSuggestions = text.trim();
        
        // Convert to a single TextAdvice object for the UI backwards compatibility if needed.
        // If the UI expects advice cards, we can create one from the AI suggestions.
        output.advice.push({
          id: 'ai-general-advice',
          severity: 'info',
          tag: 'summary',
          headline: 'AI Insights',
          detail: text.trim(),
          emoji: '✨',
          metadata: { source: 'gemini' }
        });
      }
    }
  } catch (aiErr) {
    console.warn('[insights/engine] Gemini call failed (non-fatal):', (aiErr as any)?.message);
  }

  // Generate deterministic advice cards from context
  generateDeterministicAdvice(context, output.advice);

  // Sort advice: critical → warning → positive → info
  const severityOrder = { critical: 0, warning: 1, positive: 2, info: 3 };
  output.advice.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return output;
}

function generateDeterministicAdvice(context: InsightContextDTO, advice: TextAdvice[]) {
  // Score card
  if (context.score.overall >= 80) {
    advice.push({
      id: 'score-excellent', severity: 'positive', tag: 'summary',
      headline: 'Excellent Financial Health', detail: `Your score is ${context.score.overall}/100. Keep up the good work!`,
      emoji: '🏆', metadata: {}
    });
  } else if (context.score.overall <= 40) {
    advice.push({
      id: 'score-poor', severity: 'warning', tag: 'summary',
      headline: 'Financial Health Needs Attention', detail: `Your score is ${context.score.overall}/100. Focus on your savings rate and budget compliance.`,
      emoji: '⚠️', metadata: {}
    });
  }

  // Anomalies
  for (const anomaly of context.anomalies) {
    advice.push({
      id: `anomaly-${anomaly.categoryName}`, severity: 'warning', tag: 'category_spike',
      headline: `High spend in ${anomaly.categoryName}`,
      detail: anomaly.message,
      emoji: anomaly.icon || '📈', metadata: {}
    });
  }

  // MoM
  if (context.monthOverMonth.totalSpend.direction === 'up' && context.monthOverMonth.totalSpend.isSignificant) {
    advice.push({
      id: 'mom-up', severity: 'warning', tag: 'spending_trend',
      headline: 'Spending is up',
      detail: `You spent ${context.monthOverMonth.totalSpend.percentage}% more than last month.`,
      emoji: '💸', metadata: {}
    });
  } else if (context.monthOverMonth.totalSpend.direction === 'down' && context.monthOverMonth.totalSpend.isSignificant) {
    advice.push({
      id: 'mom-down', severity: 'positive', tag: 'spending_trend',
      headline: 'Great job saving',
      detail: `You spent ${Math.abs(context.monthOverMonth.totalSpend.percentage)}% less than last month!`,
      emoji: '📉', metadata: {}
    });
  }
}
