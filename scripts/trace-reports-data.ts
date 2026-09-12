/**
 * FORENSIC TRACE: Reports Page Data Flow
 * Traces data from DB → API → Component calculations
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'smartspend',
  timezone: '+00:00',
  supportBigNumbers: true,
  bigNumberStrings: true,
};

// REPLICATE THE EXACT CONVERSION FUNCTION FROM CODE
function minorToInr(amountMinor: number): number {
  if (!Number.isInteger(amountMinor)) {
    throw new Error('Minor value must be a strict integer');
  }
  return amountMinor / 100;
}

function calculateAverageSpend(totalMinor: number, count: number): number {
  if (count <= 0) return 0;
  return Math.round(totalMinor / count);
}

function calculateSavingsMinor(incomeMinor: number, spentMinor: number): number {
  if (incomeMinor <= 0) return 0;
  return Math.max(0, incomeMinor - spentMinor);
}

async function main() {
  console.log('='.repeat(80));
  console.log('PHASE 1 — REPORTS PAGE FORENSIC TRACE');
  console.log('='.repeat(80));
  console.log('\n');

  const conn = await mysql.createConnection(DB_CONFIG);
  const userId = 1;

  try {
    // STEP 1: Get user income (exactly as API does)
    console.log('STEP 1: GET USER INCOME');
    console.log('─'.repeat(80));
    const sql1 = `SELECT monthly_income_minor FROM users WHERE id = ?`;
    console.log('SQL:', sql1);
    console.log('Params:', [userId]);
    
    const [userRows] = await conn.execute<any[]>(sql1, [userId]);
    const monthlyIncomeMinor = parseInt(userRows[0]?.monthly_income_minor ?? '0', 10);
    
    console.log('DB Result:', userRows[0]);
    console.log('monthly_income_minor (string from DB):', userRows[0]?.monthly_income_minor);
    console.log('monthly_income_minor (parsed int):', monthlyIncomeMinor);
    console.log('monthly_income_minor → INR:', minorToInr(monthlyIncomeMinor));
    console.log('\n');

    // STEP 2: Get monthly totals (exactly as API does)
    console.log('STEP 2: GET MONTHLY EXPENSE TOTALS');
    console.log('─'.repeat(80));
    const months = 6;
    const sql2 = `
      SELECT
        YEAR(e.expense_date)                                AS yr,
        MONTH(e.expense_date)                               AS mo,
        DATE_FORMAT(e.expense_date, '%b %Y')                AS month_label,
        COALESCE(SUM(e.amount_minor), 0)                    AS total_spent_minor
      FROM expenses e
      WHERE
        e.user_id = ?
        AND e.deleted_at IS NULL
        AND e.expense_date >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL ? MONTH), '%Y-%m-01')
      GROUP BY
        yr,
        mo,
        month_label
      ORDER BY
        yr ASC,
        mo ASC
    `;
    
    console.log('SQL:', sql2.trim());
    console.log('Params:', [userId, months]);
    
    const [rows] = await conn.execute<any[]>(sql2, [userId, months]);
    
    console.log('\nDB Results (raw):');
    console.table(rows.map((r: any) => ({
      year: r.yr,
      month: r.mo,
      label: r.month_label,
      total_spent_minor: r.total_spent_minor,
    })));
    console.log('\n');

    // STEP 3: Transform data (exactly as API does)
    console.log('STEP 3: API TRANSFORMATION');
    console.log('─'.repeat(80));
    
    const monthlyData = rows.map((r: any) => {
      const spentMinor   = parseInt(r.total_spent_minor, 10);
      const savingsMinor = calculateSavingsMinor(monthlyIncomeMinor, spentMinor);
      
      return {
        month:         r.month_label,
        // Minor values
        incomeMinor:   monthlyIncomeMinor,
        expensesMinor: spentMinor,
        savingsMinor,
        // INR values (what gets sent to UI)
        income:   minorToInr(monthlyIncomeMinor),
        expenses: minorToInr(spentMinor),
        savings:  minorToInr(savingsMinor),
      };
    });

    console.log('API Response Data (monthlyData):');
    console.table(monthlyData);
    console.log('\n');

    // STEP 4: Component calculations (exactly as ExpenseSummary does)
    console.log('STEP 4: COMPONENT CALCULATIONS (ExpenseSummary.tsx)');
    console.log('─'.repeat(80));
    
    // This is what the component receives from API
    const data = monthlyData.map(m => ({
      month: m.month,
      income: m.income,       // Already in INR
      expenses: m.expenses,   // Already in INR  
      savings: m.savings      // Already in INR
    }));
    
    console.log('Component receives (data prop):');
    console.table(data);
    console.log('\n');
    
    // Component calculates totals
    const totalExpenses   = data.reduce((sum, item) => sum + item.expenses, 0);
    const averageExpenses = calculateAverageSpend(totalExpenses, data.length);
    const totalSavings    = data.reduce((sum, item) => sum + item.savings, 0);
    
    console.log('Component Calculations:');
    console.log('  totalExpenses = data.reduce((sum, item) => sum + item.expenses, 0)');
    console.log('  totalExpenses =', totalExpenses);
    console.log('');
    console.log('  averageExpenses = calculateAverageSpend(totalExpenses, data.length)');
    console.log('  averageExpenses = calculateAverageSpend(' + totalExpenses + ', ' + data.length + ')');
    console.log('  averageExpenses =', averageExpenses);
    console.log('');
    console.log('  totalSavings = data.reduce((sum, item) => sum + item.savings, 0)');
    console.log('  totalSavings =', totalSavings);
    console.log('\n');

    // STEP 5: Final display values (after fmt() function)
    console.log('STEP 5: DISPLAYED VALUES (after fmt function)');
    console.log('─'.repeat(80));
    console.log('These are the values the UI SHOULD display:');
    console.log('  Total Expenses:  ₹' + totalExpenses.toFixed(2));
    console.log('  Average/Month:   ₹' + averageExpenses.toFixed(2));
    console.log('  Total Savings:   ₹' + totalSavings.toFixed(2));
    console.log('\n');

    // DIAGNOSTIC: Check for double conversion
    console.log('='.repeat(80));
    console.log('DIAGNOSTIC: CHECKING FOR DOUBLE CONVERSION BUG');
    console.log('='.repeat(80));
    console.log('\n');
    
    console.log('1. Are expenses already in INR when sent from API?');
    console.log('   YES - Line 101-102 in /api/reports/route.ts:');
    console.log('   expenses: FinanceMath.minorToInr(spentMinor)');
    console.log('');
    
    console.log('2. Does component do sum of expenses (INR values)?');
    console.log('   YES - Line 17 in expense-summary.tsx:');
    console.log('   data.reduce((sum, item) => sum + item.expenses, 0)');
    console.log('');
    
    console.log('3. Does calculateAverageSpend expect MINOR or INR?');
    const coreCode = `
    export function calculateAverageSpend(totalMinor: number, count: number): number {
      if (count <= 0) return 0;
      return Math.round(totalMinor / count);
    }`;
    console.log('   Code from core.ts:');
    console.log(coreCode);
    console.log('   Parameter name is "totalMinor" but...');
    console.log('   Component passes:', totalExpenses, '(INR value, not minor!)');
    console.log('');
    
    console.log('🐛 BUG FOUND: calculateAverageSpend receives INR but parameter name says "Minor"');
    console.log('');
    console.log('4. What does calculateAverageSpend return?');
    console.log('   Math.round(totalMinor / count)');
    console.log('   = Math.round(' + totalExpenses + ' / ' + data.length + ')');
    console.log('   = Math.round(' + (totalExpenses / data.length) + ')');
    console.log('   = ' + Math.round(totalExpenses / data.length));
    console.log('');
    console.log('   This is correct INR average: ' + Math.round(totalExpenses / data.length));
    console.log('   Not divided by 100 again.');
    console.log('');

    // VERIFICATION
    console.log('='.repeat(80));
    console.log('VERIFICATION: EXPECTED UI VALUES');
    console.log('='.repeat(80));
    console.log('\n');
    
    console.log('Based on trace, UI should show:');
    console.log('  Total Expenses:  ₹' + totalExpenses.toFixed(2));
    console.log('  Average/Month:   ₹' + averageExpenses.toFixed(2));
    console.log('  Total Savings:   ₹' + totalSavings.toFixed(2));
    console.log('\n');
    
    console.log('You reported UI shows:');
    console.log('  Total Expenses:  ₹204.6');
    console.log('  Average/Month:   ₹40.92');
    console.log('  Total Savings:   ₹27.4');
    console.log('\n');
    
    // Calculate the ratio
    if (totalExpenses > 0) {
      const ratio = 204.6 / totalExpenses;
      console.log('Ratio of reported to expected: ' + ratio);
      console.log('If ratio ≈ 0.01, that means divide by 100 happened');
      console.log('If ratio ≈ 1.00, values match');
    }
    console.log('\n');

    // Show individual month expenses
    console.log('='.repeat(80));
    console.log('MONTH-BY-MONTH BREAKDOWN');
    console.log('='.repeat(80));
    console.log('\n');
    
    for (const month of monthlyData) {
      console.log(`${month.month}:`);
      console.log(`  DB: ${month.expensesMinor} minor → ${month.expenses} INR`);
      console.log(`  Should display: ₹${month.expenses.toFixed(2)}`);
      console.log('');
    }

  } finally {
    await conn.end();
  }
}

main().catch(console.error);
