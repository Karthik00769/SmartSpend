import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { CATEGORY_RULES } from '@/lib/expense-engine/categorizer';
import type { CategorizationResult } from '@/lib/expense-engine/types';

const MODEL_CANDIDATES = [
  'gemini-3-flash',
  'gemini-3.1-flash-lite',
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
* Understand regional and global contexts including India, US, Europe, and others. Recognize services like UPI, Swiggy, Zomato, Ola, Uber, Amazon, Flipkart, LIC, etc.

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
      
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Gemini API timeout')), 6000)
      );

      const result = await Promise.race([
        model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: SchemaType.OBJECT,
              properties: {
                category: {
                  type: SchemaType.STRING,
                  description: 'The selected category from the available list: ' + categoriesListStr
                }
              },
              required: ['category']
            },
            temperature: 0.1,
            maxOutputTokens: 50,
          },
        }),
        timeoutPromise
      ]) as any;

      let responseText = result.response.text().trim();
      let parsed: { category: string };
      try {
        parsed = JSON.parse(responseText);
      } catch (e) {
        console.error(`[expenseCategorizer|${modelName}] Invalid JSON:`, responseText);
        continue;
      }
      
      const chosenCategory = parsed.category;
      console.log(`[expenseCategorizer|${modelName}] Input: "${description}" | Gemini: "${chosenCategory}"`);

      // Post Validation - Case insensitive match
      const matchedRule = CATEGORY_RULES.find(
        r => r.name.toLowerCase() === chosenCategory.toLowerCase()
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

