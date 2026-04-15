import { GoogleGenerativeAI } from '@google/generative-ai';
import { CATEGORY_RULES } from '@/lib/expense-engine/categorizer';
import type { CategorizationResult } from '@/lib/expense-engine/types';

const MODEL_CANDIDATES = [
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-pro',
];

interface GeminiCategorizeResult {
  category: string;
  confidence: number;
}

/**
 * mapToExistingCategory
 * Normalises the AI category prediction and maps it safely to DB categories.
 */
function mapToExistingCategory(category: string): CategorizationResult | null {
  const normalized = category.trim().toLowerCase();
  
  // Custom smart mapping for common synonyms that AI might use
  const aiSynonymMap: Record<string, string> = {
    'food': 'food & dining',
    'travel': 'transportation',
    'bills': 'utilities',
    'entertainment': 'entertainment',
    'health': 'healthcare',
    'education': 'education',
    'shopping': 'shopping',
    'groceries': 'food & dining',
    'transport': 'transportation',
    'rent': 'utilities',
    'utilities': 'utilities',
    'others': 'other'
  };

  const mappedName = aiSynonymMap[normalized] || normalized;

  // Search through DB category rules to find a match
  const rule = CATEGORY_RULES.find(r => r.name.toLowerCase() === mappedName || r.name.toLowerCase().includes(mappedName));
  
  if (rule) {
    return {
      categoryId: rule.categoryId,
      categoryName: rule.name,
      confidence: 'ai_medium',
      matchedOn: `AI mapped from: ${category}`
    };
  }

  return null;
}

export async function callGeminiCategorizer(description: string): Promise<CategorizationResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || !description.trim()) {
    return null;
  }

  const prompt = `
You are a financial expense categorization engine.

Your task is to classify a user's expense description into ONE category.

═══════════════════════════════
CONTEXT
═══════════════════════════════

User description:
"${description}"

Available categories:
Food, Travel, Bills, Shopping, Entertainment, Health, Education, Groceries, Transport, Rent, Utilities, Others

═══════════════════════════════
INTELLIGENCE RULES
═══════════════════════════════

1. Understand the REAL-WORLD meaning of the expense.
2. Recognize global and local brands, services, and payment methods.
3. Use contextual understanding (not just keywords).

4. Support ALL countries:
- India (UPI, Swiggy, Zomato, Ola, LIC, Paytm)
- USA (Uber, Amazon, Walmart, Netflix)
- Europe (Bolt, Deliveroo, Tesco)
- Global (Airbnb, Booking, Spotify)

5. If a brand implies a category, map it directly:
- Food delivery apps → Food
- Ride apps → Transport
- Streaming → Entertainment
- E-commerce → Shopping
- Utilities/services → Bills or Utilities

6. Prefer the MOST LOGICAL real-world category.

7. DO NOT invent categories.

8. If unclear → return "Others"

═══════════════════════════════
STRICT OUTPUT FORMAT
═══════════════════════════════

Return ONLY this JSON:

{
  "category": "category_name",
  "confidence": 0.0 to 1.0
}

NO explanations
NO extra text
  `.trim();

  const genAI = new GoogleGenerativeAI(apiKey);

  for (const modelName of MODEL_CANDIDATES) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1, // Keep it deterministic
        },
      });

      const responseText = result.response.text();
      const aiResult: GeminiCategorizeResult = JSON.parse(responseText);

      if (aiResult.confidence < 0.6) {
        return null; // Fallback to "Others" logic
      }

      const mapped = mapToExistingCategory(aiResult.category);
      if (mapped) {
        // Carry over high confidence marker for the rest of our engine
        mapped.confidence = aiResult.confidence >= 0.9 ? 'ai_high' : 'ai_medium' as any;
        return mapped;
      }
    } catch (err: any) {
      const is404 = err?.status === 404 || String(err?.message).includes('404') || String(err?.message).includes('not found');
      if (is404) {
        console.warn(`[expenseCategorizer] Model "${modelName}" not found — trying next.`);
        continue;
      }
      console.error(`[expenseCategorizer] Gemini error with "${modelName}":`, err?.message ?? err);
      break;
    }
  }

  return null;
}
