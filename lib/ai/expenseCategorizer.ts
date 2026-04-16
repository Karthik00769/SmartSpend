import { GoogleGenerativeAI } from '@google/generative-ai';
import { CATEGORY_RULES } from '@/lib/expense-engine/categorizer';
import type { CategorizationResult } from '@/lib/expense-engine/types';

const MODEL_CANDIDATES = [
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-pro',
];

export async function callGeminiCategorizer(description: string): Promise<CategorizationResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || !description.trim()) {
    return null;
  }

  // Fetch categories from DB (CATEGORY_RULES)
  const availableCategories = CATEGORY_RULES.map(r => r.name);
  const categoriesListStr = availableCategories.join(', ');

  const prompt = `You are a financial categorization engine.

Your job is to classify an expense into ONE category from a given list.

STRICT RULES:
* You MUST return ONLY ONE category from the provided list
* DO NOT create new categories
* DO NOT modify category names
* DO NOT explain anything
* DO NOT return sentences
* If uncertain, return "Other"

CONTEXT:
* Understand global + regional usage (India, US, Europe, etc.)
* Examples:
  Swiggy → Food & Dining
  Zomato → Food & Dining
  Uber → Transportation
  Ola → Transportation
  LIC → Utilities
  Amazon → Shopping

---
USER INPUT:
Description:
"${description}"

Available Categories:
${categoriesListStr}

---
EXPECTED OUTPUT FORMAT:
Return ONLY the category name.`;

  const genAI = new GoogleGenerativeAI(apiKey);

  for (const modelName of MODEL_CANDIDATES) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'text/plain',
          temperature: 0.2,
          maxOutputTokens: 20,
        },
      });

      const responseText = result.response.text().trim();
      
      console.log(`[expenseCategorizer|${modelName}] Input: "${description}" | Gemini: "${responseText}"`);

      // Post Validation - Case insensitive match
      const matchedRule = CATEGORY_RULES.find(
        r => r.name.toLowerCase() === responseText.toLowerCase()
      );

      // If response NOT in category list, return 'Other' (ID: 9 in CATEGORY_RULES)
      if (!matchedRule) {
        console.warn(`[expenseCategorizer] "${responseText}" not in DB. Assuming "Other".`);
        const fallback = CATEGORY_RULES.find(r => r.name.toLowerCase() === 'other') || CATEGORY_RULES[CATEGORY_RULES.length - 1];
        return {
          categoryId: fallback.categoryId,
          categoryName: fallback.name,
          confidence: 'fallback',
          matchedOn: `AI unmapped: ${responseText}`,
        };
      }

      console.log(`[expenseCategorizer] Mapped to DB Category: "${matchedRule.name}"`);

      return {
        categoryId: matchedRule.categoryId,
        categoryName: matchedRule.name,
        confidence: 'ai_high',
        matchedOn: `AI mapped from: ${responseText}`,
      };

    } catch (err: any) {
      const is404 = err?.status === 404 || String(err?.message).includes('404') || String(err?.message).includes('not found');
      if (is404) {
        console.warn(`[expenseCategorizer] Model "${modelName}" not found — trying next.`);
        continue;
      }
      console.error(`[expenseCategorizer] Gemini error with "${modelName}":`, err?.message ?? err);
      break; // break on non-404 errors (like auth, quota)
    }
  }

  return null;
}

