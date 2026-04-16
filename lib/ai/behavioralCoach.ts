import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL_CANDIDATES = [
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-pro',
];

export interface CoachInput {
  category: string;
  spend: number;
  budget: number;
  currency: string;
}

/**
 * generateBehavioralAdvice
 * Calls Gemini to provide a short, realistic, actionable behavioral recommendation
 * based on user spending over a budget limit.
 */
export async function generateBehavioralAdvice(input: CoachInput): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const prompt = `SYSTEM:

You are a behavioral finance coach.

Give short, realistic advice.

RULES:
* No generic advice
* Be specific
* Suggest % or amount change
* Understand regional and global contexts including India, US, Europe, and others. Recognize services like UPI, Swiggy, Zomato, Ola, Uber, Amazon, Flipkart, LIC, etc.

---
USER:

Input:
${JSON.stringify(input, null, 2)}

Give 1 recommendation.`;

  const genAI = new GoogleGenerativeAI(apiKey);

  for (const modelName of MODEL_CANDIDATES) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'text/plain',
          temperature: 0.3, 
          maxOutputTokens: 60,
        },
      });

      let text = result.response.text().trim();
      text = text.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').replace(/^["']|["']$/g, '').trim();
      if (text) {
         console.log(`[behavioralCoach|${modelName}] Input category: ${input.category} -> Advice: "${text}"`);
         return text;
      }
    } catch (err: any) {
      const is404 = err?.status === 404 || String(err?.message).includes('404') || String(err?.message).includes('not found');
      if (is404) continue;
      console.error(`[behavioralCoach] Gemini error with "${modelName}":`, err?.message ?? err);
      break;
    }
  }

  return null;
}
