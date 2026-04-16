import { GoogleGenerativeAI } from '@google/generative-ai';

export interface FormulaMetric {
  name: string;
  formula: string;
  explanation: string;
  example: string;
}

const MODEL_CANDIDATES = [
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-pro',
];

export async function generateFormulaSheet(currency: string): Promise<FormulaMetric[] | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return getFallbackFormulas(currency);

  const prompt = `SYSTEM:

You are a financial system explainer AI.

Your job is to clearly explain how financial calculations work in our app.

STRICT RULES:
* Use ONLY real formulas (no assumptions)
* Keep explanations simple and human-friendly
* Use the given currency symbol (${currency}) where needed
* DO NOT hallucinate metrics
* DO NOT add extra formulas
* Maintain consistency with financial logic
* Ensure all 6 required metrics exist
* Explain the Financial Score based strictly on the provided logic.

REQUIRED METRICS:
1. Savings Rate
2. Budget Usage
3. Goal Progress
4. Monthly Spend
5. Category Spend
6. Financial Score

CODE BASE LOGIC FACTS (DO NOT INVENT ANYTHING ELSE):
- Savings Rate: ((monthlyIncome - totalSpent) / monthlyIncome) * 100
- Budget Usage: (spent / allocated_limit) * 100
- Goal Progress: (savedAmount / targetAmount) * 100
- Monthly Spend: Sum of all expenses within the current month
- Category Spend: Sum of expenses assigned to a specific category
- Financial Score: A weighted composite score out of 100: Savings Rate (40%), Budget Compliance (30%), Spending Stability (20%), Goal Progress (10%).

---
USER:

Generate a formula sheet with exactly these 6 metrics.
For each metric, provide:
1. Name
2. Formula (mathematical expression)
3. Explanation (simple words)
4. Example (with numbers using ${currency})

Input:
{
  "currency": "${currency}",
  "metrics": ["savings_rate", "budget_usage", "goal_progress", "monthly_spend", "category_spend", "financial_score"]
}

---
OUTPUT FORMAT (STRICT JSON ARRAY OF OBJECTS ONLY):
[
  {
    "name": "Savings Rate",
    "formula": "(income - expenses) / income × 100",
    "explanation": "This shows how much money you save from your income after spending.",
    "example": "If income is ${currency}50,000 and expenses are ${currency}30,000, savings rate = 40%"
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
          temperature: 0.1, 
        },
      });

      let responseText = result.response.text().trim();
      responseText = responseText.replace(/```json\n?/g, '').replace(/```/g, '').trim();
      
      let raw: any = [];
      try {
        raw = JSON.parse(responseText);
      } catch (parseErr) {
        console.warn(`[formulaGenerator] JSON parse error on ${modelName}. Output: ${responseText}`);
        continue;
      }

      if (Array.isArray(raw) && raw.length === 6) {
        // Validate required metric names exist
        const expected = ["Savings Rate", "Budget Usage", "Goal Progress", "Monthly Spend", "Category Spend", "Financial Score"];
        const found = raw.map(r => r.name);
        const hasAll = expected.every(e => found.some(f => String(f).toLowerCase() === e.toLowerCase()));
        
        if (hasAll) {
          return raw as FormulaMetric[];
        }
      }
      
      console.warn(`[formulaGenerator] Invalid structure returned from ${modelName}. Expected 6 specific metrics.`);
    } catch (err: any) {
      const is404 = err?.status === 404 || String(err?.message).includes('404') || String(err?.message).includes('not found');
      if (is404) continue;
      console.error(`[formulaGenerator] Gemini error with "${modelName}":`, err?.message ?? err);
      break;
    }
  }

  return getFallbackFormulas(currency);
}

function getFallbackFormulas(currency: string): FormulaMetric[] {
  return [
    {
      name: "Savings Rate",
      formula: "((Income - Expenses) / Income) × 100",
      explanation: "Shows the percentage of your monthly income you've managed to save.",
      example: `If income is ${currency}50,000 and expenses are ${currency}30,000, savings rate = 40%`
    },
    {
      name: "Budget Usage",
      formula: "(Spent / Limit) × 100",
      explanation: "Indicates how much of a specific budget category limit has been spent.",
      example: `If budget is ${currency}10,000 and spent is ${currency}7,000, usage = 70%`
    },
    {
      name: "Goal Progress",
      formula: "(Saved Amount / Target Amount) × 100",
      explanation: "Measures your completion percentage towards a saving goal.",
      example: `If target is ${currency}1,00,000 and saved is ${currency}25,000, progress = 25%`
    },
    {
      name: "Monthly Spend",
      formula: "Σ (Transactions where type = Expense in Current Month)",
      explanation: "The total sum of all expense transactions recorded this month.",
      example: `Summing a ${currency}500 meal and ${currency}1500 grocery run yields a ${currency}2000 Monthly Spend`
    },
    {
      name: "Category Spend",
      formula: "Σ (Expenses grouped by Category)",
      explanation: "The total sum of all expenses allocated to a specific spending category.",
      example: `Summing three ${currency}1000 grocery receipts equals a ${currency}3000 Category Spend`
    },
    {
       name: "Financial Score",
       formula: "Composite Score out of 100",
       explanation: "Calculated based on savings rate (40%), budget control (30%), spending stability (20%), and goal progress (10%).",
       example: "Achieving full marks in savings rate and budget control gives you a baseline score of 70 before other modifiers."
    }
  ];
}
