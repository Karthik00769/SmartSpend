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
  message: string;
}

// ─── AI Generator Function ───────────────────────────────────────────────────

/**
 * generateInsights
 * Uses the Gemini API to analyze a user's financial snapshot and generate
 * actionable insights (warnings, opportunities, or trends).
 */
export async function generateInsights(data: UserFinancialData): Promise<GeneratedInsight[]> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.warn('GEMINI_API_KEY is not defined in environment variables. Returning empty insights.');
    return [];
  }

  // Initialize the Gemini API client
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });


  const prompt = `
    You are an expert financial advisor AI for the SmartSpend app.
    Analyze the following user financial data and generate 3 to 5 brief, highly actionable insights.
    
    Data Context:
    - Total Monthly Spending: $${data.monthlySpending}
    - Category Breakdown: ${JSON.stringify(data.categoryDistribution)}
    - Budgets: ${JSON.stringify(data.budgetUsage)}
    - Savings Goals: ${JSON.stringify(data.goalProgress)}

    Instructions:
    Generate insights identifying spending trends, budget warnings (e.g. nearing a limit), or savings suggestions.
    
    You must return the result strictly as a valid JSON array containing objects with the following schema:
    [
      {
        "type": "warning | opportunity | trend",
        "message": "The insight message text (1-2 sentences max)"
      }
    ]
  `;

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

    const responseText = result.response.text();
    
    // Parse the JSON array from the Gemini response
    const insights: GeneratedInsight[] = JSON.parse(responseText);
    
    // Filter to ensure structure compliance just in case
    return insights.filter(
      (insight) => 
        insight.message && 
        ['warning', 'opportunity', 'trend'].includes(insight.type)
    );
  } catch (error) {
    console.error('[Gemini API] Failed to generate insights:', error);
    return [];
  }
}
