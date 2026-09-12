import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { findOrCreateCategory } from '@/services/expense.service';
import { processExpense } from '@/lib/expense-engine';
import * as FinanceCore from '@/lib/finance';

const IntakeAdapterSchema = z.object({
  userId:       z.union([z.string(), z.number()]).transform(String).optional(),
  categoryId:   z.preprocess((val) => val != null && val !== '' ? Number(val) : undefined, z.number().optional()),
  categoryName: z.string().trim().max(100).optional(),
  amount:       z.coerce.number(),
  date:         z.string(),
  description:  z.string().default(''),
  source:       z.enum(['manual', 'receipt_scan', 'bank_import']).default('manual'),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = IntakeAdapterSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'intake failed' }, { status: 400 });

  const userId = "1";
  
  try {
    let resolvedCategoryId = parsed.data.categoryId || 1;

    const amountMinor = FinanceCore.Math.inrToMinor(parsed.data.amount);
    const sanitizedMerchant = FinanceCore.Parsing.sanitizeMerchantName(parsed.data.description);

    const validationResult = FinanceCore.Validation.CreateExpenseInputSchema.safeParse({
      userId,
      categoryId: resolvedCategoryId,
      amountMinor,
      date: parsed.data.date,
      merchantName: sanitizedMerchant,
      description: parsed.data.description,
    });

    if (!validationResult.success) {
      return NextResponse.json({
        where: 'Boundary Validation',
        details: validationResult.error.flatten()
      });
    }

    const coreData = validationResult.data;

    const engineRaw = {
      userId:      coreData.userId as string,
      categoryId:  coreData.categoryId,
      amountMinor: coreData.amountMinor,
      date:        coreData.date,
      description: coreData.merchantName,
      source:      parsed.data.source,
    };

    const result = await processExpense(engineRaw, userId);

    if (!result.validation.valid) {
      return NextResponse.json({
        where: 'Engine Validation',
        details: result.validation.errors
      });
    }

    return NextResponse.json({ success: true, engineRaw });
  } catch (err: any) {
    return NextResponse.json({ error: err.message });
  }
}
