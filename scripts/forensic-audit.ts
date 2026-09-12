/**
 * PRODUCTION FORENSIC AUDIT MODE
 * 
 * This script performs a comprehensive data validation audit
 * by querying the actual database and comparing values across layers.
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import path from 'path';

// Load environment variables
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

interface User {
  id: number;
  email: string;
  name: string;
  monthly_income_minor: string;
  currency_code: string;
}

interface Expense {
  id: number;
  user_id: number;
  amount_minor: string;
  currency_code: string;
  category: string;
  description: string;
  expense_date: Date;
  is_recurring: number;
  recurrence_pattern?: string;
  created_at: Date;
}

interface Budget {
  id: number;
  user_id: number;
  category: string;
  limit_minor: string;
  currency_code: string;
  month: string;
  created_at: Date;
}

interface Goal {
  id: number;
  user_id: number;
  name: string;
  target_minor: string;
  saved_minor: string;
  currency_code: string;
  deadline: Date;
  status: string;
  created_at: Date;
}

interface Settings {
  id: number;
  user_id: number;
  monthly_income_minor: string;
  currency_code: string;
  theme?: string;
  updated_at: Date;
}

async function main() {
  console.log('='.repeat(80));
  console.log('PRODUCTION FORENSIC AUDIT MODE');
  console.log('='.repeat(80));
  console.log('\n');

  let conn: mysql.Connection;
  
  try {
    console.log('Connecting to database:', DB_CONFIG.database, 'at', DB_CONFIG.host);
    conn = await mysql.createConnection(DB_CONFIG);
    console.log('✅ Connected successfully\n');
  } catch (e: any) {
    console.error('❌ Database connection failed:', e.message);
    process.exit(1);
  }

  try {
    // Check available tables
    console.log('📋 Checking database schema...\n');
    const [tables] = await conn.execute<any[]>('SHOW TABLES');
    console.log('Available tables:');
    console.table(tables);
    console.log('\n');

    // =================================================================
    // PHASE 1 — LIVE DATA FORENSIC TRACE
    // =================================================================
    console.log('='.repeat(80));
    console.log('PHASE 1 — LIVE DATA FORENSIC TRACE');
    console.log('='.repeat(80));
    console.log('\n');

    // Get all users
    const [users] = await conn.execute<any[]>('SELECT * FROM users ORDER BY id');
    console.log('📊 TOTAL USERS:', users.length);
    console.log('\n');

    if (users.length === 0) {
      console.log('⚠️  NO USERS FOUND IN DATABASE');
      console.log('Cannot perform audit without users.');
      await conn.end();
      return;
    }

    // Audit each user
    for (const user of users) {
      console.log('─'.repeat(80));
      console.log(`USER: ${user.name} (${user.email})`);
      console.log(`USER ID: ${user.id}`);
      console.log('─'.repeat(80));
      console.log('\n');

      // 1. All expenses
      console.log('1️⃣  ALL EXPENSES FOR USER');
      const [expenses] = await conn.execute<any[]>(
        'SELECT * FROM expenses WHERE user_id = ? ORDER BY expense_date DESC',
        [user.id]
      );
      console.log('Total Expenses:', expenses.length);
      if (expenses.length > 0) {
        console.table(expenses.map((e: any) => ({
          id: e.id,
          amount_minor: e.amount_minor,
          currency: e.currency_code,
          category: e.category,
          description: e.description?.substring(0, 30),
          date: e.expense_date,
          recurring: e.is_recurring ? 'YES' : 'NO',
        })));
      } else {
        console.log('   (No expenses found)');
      }
      console.log('\n');

      // 2. All goals
      console.log('2️⃣  ALL GOALS FOR USER');
      const [goals] = await conn.execute<any[]>(
        'SELECT * FROM goals WHERE user_id = ? ORDER BY created_at DESC',
        [user.id]
      );
      console.log('Total Goals:', goals.length);
      if (goals.length > 0) {
        console.table(goals.map((g: any) => ({
          id: g.id,
          name: g.name,
          target_minor: g.target_minor,
          saved_minor: g.saved_minor,
          currency: g.currency_code,
          deadline: g.deadline,
          status: g.status,
        })));
      } else {
        console.log('   (No goals found)');
      }
      console.log('\n');

      // 3. All budgets
      console.log('3️⃣  ALL BUDGETS FOR USER');
      const [budgets] = await conn.execute<any[]>(
        'SELECT * FROM budgets WHERE user_id = ? ORDER BY month DESC',
        [user.id]
      );
      console.log('Total Budgets:', budgets.length);
      if (budgets.length > 0) {
        console.table(budgets.map((b: any) => ({
          id: b.id,
          category: b.category,
          limit_minor: b.limit_minor,
          currency: b.currency_code,
          month: b.month,
        })));
      } else {
        console.log('   (No budgets found)');
      }
      console.log('\n');

      // 4. User settings (check if table exists)
      console.log('4️⃣  USER SETTINGS');
      const [settingsTables] = await conn.execute<any[]>(
        `SELECT COUNT(*) as count FROM information_schema.tables 
         WHERE table_schema = DATABASE() AND table_name = 'settings'`
      );
      const settingsTableExists = settingsTables[0]?.count > 0;
      
      let settings: any[] = [];
      if (settingsTableExists) {
        const [settingsResult] = await conn.execute<any[]>(
          'SELECT * FROM settings WHERE user_id = ?',
          [user.id]
        );
        settings = settingsResult;
        
        if (settings.length > 0) {
          console.table(settings.map((s: any) => ({
            id: s.id,
            user_id: s.user_id,
            monthly_income_minor: s.monthly_income_minor,
            currency_code: s.currency_code,
            theme: s.theme,
            updated_at: s.updated_at,
          })));
        } else {
          console.log('   (No settings found)');
        }
      } else {
        console.log('   ⚠️  SETTINGS TABLE DOES NOT EXIST - Using users table');
      }
      console.log('\n');

      // 5. Monthly income from users table
      console.log('5️⃣  MONTHLY INCOME (from users table)');
      console.log('   monthly_income_minor:', user.monthly_income_minor);
      console.log('   Decimal value:', Number(user.monthly_income_minor) / 100);
      console.log('\n');

      // 6. Currency
      console.log('6️⃣  CURRENCY (from users table)');
      console.log('   currency_code:', user.currency_code);
      console.log('\n');

      // 7. Health score inputs
      console.log('7️⃣  HEALTH SCORE INPUTS');
      const settingsData = settings.length > 0 ? settings[0] : null;
      const monthlyIncome = settingsData?.monthly_income_minor || user.monthly_income_minor;
      const currency = settingsData?.currency_code || user.currency_code;
      
      // Calculate current month expenses
      const [currentMonthExpenses] = await conn.execute<any[]>(
        `SELECT SUM(amount_minor) as total 
         FROM expenses 
         WHERE user_id = ? 
         AND YEAR(expense_date) = YEAR(CURDATE()) 
         AND MONTH(expense_date) = MONTH(CURDATE())`,
        [user.id]
      );
      const monthlySpend = currentMonthExpenses[0]?.total || '0';
      
      // Calculate savings
      const savings = Number(monthlyIncome) - Number(monthlySpend);
      
      console.log('   Monthly Income (minor):', monthlyIncome, '→', Number(monthlyIncome) / 100);
      console.log('   Current Month Spend (minor):', monthlySpend, '→', Number(monthlySpend) / 100);
      console.log('   Calculated Savings (minor):', savings, '→', savings / 100);
      console.log('   Currency:', currency);
      console.log('\n');

      // Calculate budget adherence
      const now = new Date();
      const currentMonth = now.getMonth() + 1; // 1-12
      const currentYear = now.getFullYear();
      const [currentBudgets] = await conn.execute<any[]>(
        'SELECT * FROM budgets WHERE user_id = ? AND year = ? AND month = ?',
        [user.id, currentYear, currentMonth]
      );
      
      console.log('   Budget Check for', `${currentYear}-${String(currentMonth).padStart(2, '0')}`);
      if (currentBudgets.length > 0) {
        for (const budget of currentBudgets) {
          const [categorySpend] = await conn.execute<any[]>(
            `SELECT SUM(amount_minor) as total 
             FROM expenses 
             WHERE user_id = ? 
             AND category_id = ?
             AND YEAR(expense_date) = ? 
             AND MONTH(expense_date) = ?`,
            [user.id, budget.category_id, currentYear, currentMonth]
          );
          const spent = Number(categorySpend[0]?.total || '0');
          const limit = Number(budget.limit_minor);
          const percentage = limit > 0 ? (spent / limit) * 100 : 0;
          
          console.log(`   - ${budget.category}: ${spent / 100} / ${limit / 100} (${percentage.toFixed(1)}%)`);
        }
      } else {
        console.log('   (No budgets set for current month)');
      }
      console.log('\n');
    }

    // =================================================================
    // PHASE 2 — REPORTS PAGE RECONCILIATION
    // =================================================================
    console.log('\n');
    console.log('='.repeat(80));
    console.log('PHASE 2 — REPORTS PAGE RECONCILIATION');
    console.log('='.repeat(80));
    console.log('\n');

    for (const user of users) {
      console.log(`Analyzing Reports for User: ${user.name} (ID: ${user.id})`);
      console.log('─'.repeat(80));

      // A. Total Expenses
      console.log('\n🔍 METRIC: Total Expenses');
      const sqlTotalExpenses = `
        SELECT SUM(amount_minor) as total 
        FROM expenses 
        WHERE user_id = ?
      `.trim();
      console.log('SQL Query:');
      console.log(sqlTotalExpenses);
      console.log('Parameters:', [user.id]);
      
      const [totalExpensesResult] = await conn.execute<any[]>(sqlTotalExpenses, [user.id]);
      const totalExpensesDB = totalExpensesResult[0]?.total || '0';
      console.log('SQL Result (minor):', totalExpensesDB);
      console.log('SQL Result (decimal):', Number(totalExpensesDB) / 100);
      console.log('Status: ⏳ NEED API/UI COMPARISON');
      console.log('\n');

      // B. Average Monthly Spend
      console.log('🔍 METRIC: Average Monthly Spend');
      const sqlAvgMonthly = `
        SELECT 
          COUNT(DISTINCT DATE_FORMAT(expense_date, '%Y-%m')) as month_count,
          SUM(amount_minor) as total
        FROM expenses 
        WHERE user_id = ?
      `.trim();
      console.log('SQL Query:');
      console.log(sqlAvgMonthly);
      console.log('Parameters:', [user.id]);
      
      const [avgMonthlyResult] = await conn.execute<any[]>(sqlAvgMonthly, [user.id]);
      const monthCount = Number(avgMonthlyResult[0]?.month_count || 1);
      const totalForAvg = Number(avgMonthlyResult[0]?.total || '0');
      const avgMonthlyDB = monthCount > 0 ? totalForAvg / monthCount : 0;
      
      console.log('SQL Result - Total (minor):', totalForAvg);
      console.log('SQL Result - Month Count:', monthCount);
      console.log('SQL Result - Average (minor):', avgMonthlyDB.toFixed(0));
      console.log('SQL Result - Average (decimal):', (avgMonthlyDB / 100).toFixed(2));
      console.log('Status: ⏳ NEED API/UI COMPARISON');
      console.log('\n');

      // C. Total Savings (based on income - expenses)
      console.log('🔍 METRIC: Total Savings');
      const monthlyIncome = user.monthly_income_minor;
      const [savingsMonths] = await conn.execute<any[]>(
        `SELECT 
          DATE_FORMAT(expense_date, '%Y-%m') as month,
          SUM(amount_minor) as spent
         FROM expenses 
         WHERE user_id = ?
         GROUP BY DATE_FORMAT(expense_date, '%Y-%m')`,
        [user.id]
      );
      
      let totalSavings = 0;
      console.log('Savings Calculation:');
      for (const month of savingsMonths) {
        const monthlySavings = Number(monthlyIncome) - Number(month.spent);
        totalSavings += monthlySavings;
        console.log(`  ${month.month}: Income ${Number(monthlyIncome)/100} - Spent ${Number(month.spent)/100} = Saved ${monthlySavings/100}`);
      }
      console.log('SQL Result - Total Savings (minor):', totalSavings);
      console.log('SQL Result - Total Savings (decimal):', (totalSavings / 100).toFixed(2));
      console.log('Status: ⏳ NEED API/UI COMPARISON');
      console.log('\n');

      // D. Monthly Graph Data
      console.log('🔍 METRIC: Monthly Graph Data');
      const [monthlyData] = await conn.execute<any[]>(
        `SELECT 
          DATE_FORMAT(expense_date, '%Y-%m') as month,
          SUM(amount_minor) as total
         FROM expenses 
         WHERE user_id = ?
         GROUP BY DATE_FORMAT(expense_date, '%Y-%m')
         ORDER BY month DESC
         LIMIT 12`,
        [user.id]
      );
      console.log('SQL Query: Last 12 months grouped spending');
      console.log('SQL Result:');
      console.table(monthlyData.map((m: any) => ({
        month: m.month,
        total_minor: m.total,
        total_decimal: Number(m.total) / 100,
      })));
      console.log('Status: ⏳ NEED API/UI COMPARISON');
      console.log('\n');

      // E. Category Breakdown
      console.log('🔍 METRIC: Category Breakdown');
      const [categoryData] = await conn.execute<any[]>(
        `SELECT 
          category,
          SUM(amount_minor) as total,
          COUNT(*) as count
         FROM expenses 
         WHERE user_id = ?
         GROUP BY category
         ORDER BY total DESC`,
        [user.id]
      );
      console.log('SQL Query: Total spending by category');
      console.log('SQL Result:');
      console.table(categoryData.map((c: any) => ({
        category: c.category,
        total_minor: c.total,
        total_decimal: Number(c.total) / 100,
        count: c.count,
      })));
      console.log('Status: ⏳ NEED API/UI COMPARISON');
      console.log('\n');
    }

    // =================================================================
    // PHASE 3 — INSIGHTS PAGE RECONCILIATION
    // =================================================================
    console.log('\n');
    console.log('='.repeat(80));
    console.log('PHASE 3 — INSIGHTS PAGE RECONCILIATION');
    console.log('='.repeat(80));
    console.log('\n');

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    for (const user of users) {
      console.log(`Analyzing Insights for User: ${user.name} (ID: ${user.id})`);
      console.log('─'.repeat(80));
      console.log('\n');

      // This Month
      console.log('📅 THIS MONTH');
      const thisMonthStart = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
      const thisMonthEnd = new Date(currentYear, currentMonth, 0).toISOString().split('T')[0];
      console.log('Date Range:', thisMonthStart, 'to', thisMonthEnd);
      
      const [thisMonthExpenses] = await conn.execute<any[]>(
        `SELECT * FROM expenses 
         WHERE user_id = ? 
         AND expense_date >= ? 
         AND expense_date <= ?
         ORDER BY expense_date DESC`,
        [user.id, thisMonthStart, thisMonthEnd]
      );
      
      const [thisMonthTotal] = await conn.execute<any[]>(
        `SELECT SUM(amount_minor) as total FROM expenses 
         WHERE user_id = ? 
         AND expense_date >= ? 
         AND expense_date <= ?`,
        [user.id, thisMonthStart, thisMonthEnd]
      );
      
      const thisMonthSpend = Number(thisMonthTotal[0]?.total || '0');
      const thisMonthIncome = Number(user.monthly_income_minor);
      const thisMonthSavings = thisMonthIncome - thisMonthSpend;
      
      console.log('Expense Rows Used:', thisMonthExpenses.length);
      console.log('Income Used (minor):', thisMonthIncome, '→', thisMonthIncome / 100);
      console.log('Total Spend (minor):', thisMonthSpend, '→', thisMonthSpend / 100);
      console.log('Savings Formula: Income - Spend =', thisMonthSavings, '→', thisMonthSavings / 100);
      console.log('Status: ⏳ NEED API/UI COMPARISON');
      console.log('\n');

      // Last Month
      console.log('📅 LAST MONTH');
      const lastMonth = currentMonth === 1 ? 12 : currentMonth - 1;
      const lastMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear;
      const lastMonthStart = `${lastMonthYear}-${String(lastMonth).padStart(2, '0')}-01`;
      const lastMonthEnd = new Date(lastMonthYear, lastMonth, 0).toISOString().split('T')[0];
      console.log('Date Range:', lastMonthStart, 'to', lastMonthEnd);
      
      const [lastMonthExpenses] = await conn.execute<any[]>(
        `SELECT * FROM expenses 
         WHERE user_id = ? 
         AND expense_date >= ? 
         AND expense_date <= ?
         ORDER BY expense_date DESC`,
        [user.id, lastMonthStart, lastMonthEnd]
      );
      
      const [lastMonthTotal] = await conn.execute<any[]>(
        `SELECT SUM(amount_minor) as total FROM expenses 
         WHERE user_id = ? 
         AND expense_date >= ? 
         AND expense_date <= ?`,
        [user.id, lastMonthStart, lastMonthEnd]
      );
      
      const lastMonthSpend = Number(lastMonthTotal[0]?.total || '0');
      const lastMonthSavings = thisMonthIncome - lastMonthSpend;
      
      console.log('Expense Rows Used:', lastMonthExpenses.length);
      console.log('Income Used (minor):', thisMonthIncome, '→', thisMonthIncome / 100);
      console.log('Total Spend (minor):', lastMonthSpend, '→', lastMonthSpend / 100);
      console.log('Savings Formula: Income - Spend =', lastMonthSavings, '→', lastMonthSavings / 100);
      
      // Trend calculation
      const trend = lastMonthSpend > 0 
        ? ((thisMonthSpend - lastMonthSpend) / lastMonthSpend) * 100 
        : 0;
      console.log('Trend Formula: ((This - Last) / Last) * 100 =', trend.toFixed(2), '%');
      console.log('Status: ⏳ NEED API/UI COMPARISON');
      console.log('\n');

      // Last 3 Months
      console.log('📅 LAST 3 MONTHS');
      const threeMonthsAgo = new Date(currentYear, currentMonth - 3, 1);
      const threeMonthsStart = threeMonthsAgo.toISOString().split('T')[0];
      console.log('Date Range:', threeMonthsStart, 'to', thisMonthEnd);
      
      const [last3MonthsExpenses] = await conn.execute<any[]>(
        `SELECT * FROM expenses 
         WHERE user_id = ? 
         AND expense_date >= ? 
         AND expense_date <= ?
         ORDER BY expense_date DESC`,
        [user.id, threeMonthsStart, thisMonthEnd]
      );
      
      const [last3MonthsTotal] = await conn.execute<any[]>(
        `SELECT SUM(amount_minor) as total FROM expenses 
         WHERE user_id = ? 
         AND expense_date >= ? 
         AND expense_date <= ?`,
        [user.id, threeMonthsStart, thisMonthEnd]
      );
      
      const last3MonthsSpend = Number(last3MonthsTotal[0]?.total || '0');
      const last3MonthsIncome = thisMonthIncome * 3;
      const last3MonthsSavings = last3MonthsIncome - last3MonthsSpend;
      const avgMonthlySpend3M = last3MonthsSpend / 3;
      
      console.log('Expense Rows Used:', last3MonthsExpenses.length);
      console.log('Income Used (minor):', last3MonthsIncome, '→', last3MonthsIncome / 100);
      console.log('Total Spend (minor):', last3MonthsSpend, '→', last3MonthsSpend / 100);
      console.log('Savings Formula: (Income*3) - Spend =', last3MonthsSavings, '→', last3MonthsSavings / 100);
      console.log('Average Monthly Spend:', avgMonthlySpend3M, '→', avgMonthlySpend3M / 100);
      console.log('Status: ⏳ NEED API/UI COMPARISON');
      console.log('\n');
    }

    // =================================================================
    // PHASE 4 — FINANCIAL HEALTH SCORE
    // =================================================================
    console.log('\n');
    console.log('='.repeat(80));
    console.log('PHASE 4 — FINANCIAL HEALTH SCORE VALIDATION');
    console.log('='.repeat(80));
    console.log('\n');

    for (const user of users) {
      console.log(`Analyzing Health Score for User: ${user.name} (ID: ${user.id})`);
      console.log('─'.repeat(80));
      console.log('\n');

      const monthlyIncome = Number(user.monthly_income_minor);
      
      // Current month data
      const [currentMonthTotal] = await conn.execute<any[]>(
        `SELECT SUM(amount_minor) as total FROM expenses 
         WHERE user_id = ? 
         AND YEAR(expense_date) = YEAR(CURDATE()) 
         AND MONTH(expense_date) = MONTH(CURDATE())`,
        [user.id]
      );
      const monthlySpend = Number(currentMonthTotal[0]?.total || '0');
      const monthlySavings = monthlyIncome - monthlySpend;
      const savingsRate = monthlyIncome > 0 ? (monthlySavings / monthlyIncome) * 100 : 0;

      // 1. SAVINGS COMPONENT (max 40 points)
      console.log('💰 SAVINGS COMPONENT (Max: 40 points)');
      console.log('   Monthly Income:', monthlyIncome / 100);
      console.log('   Monthly Spend:', monthlySpend / 100);
      console.log('   Monthly Savings:', monthlySavings / 100);
      console.log('   Savings Rate:', savingsRate.toFixed(2), '%');
      
      let savingsScore = 0;
      if (savingsRate >= 20) savingsScore = 40;
      else if (savingsRate >= 15) savingsScore = 30;
      else if (savingsRate >= 10) savingsScore = 20;
      else if (savingsRate >= 5) savingsScore = 10;
      else savingsScore = 0;
      
      console.log('   ➜ Savings Score:', savingsScore, '/ 40');
      if (savingsScore < 40) {
        console.log('   ⚠️  EXPECTED RECOMMENDATION: Increase savings rate');
      } else {
        console.log('   ✅ Perfect score - NO recommendation expected');
      }
      console.log('\n');

      // 2. BUDGET COMPONENT (max 30 points)
      console.log('📊 BUDGET ADHERENCE COMPONENT (Max: 30 points)');
      const now2 = new Date();
      const currentMonth2 = now2.getMonth() + 1;
      const currentYear2 = now2.getFullYear();
      const [budgets] = await conn.execute<any[]>(
        'SELECT * FROM budgets WHERE user_id = ? AND year = ? AND month = ?',
        [user.id, currentYear2, currentMonth2]
      );
      
      console.log('   Budgets Set for', `${currentYear2}-${String(currentMonth2).padStart(2, '0')}`, ':', budgets.length);
      
      let budgetScore = 0;
      let budgetsExceeded = 0;
      
      if (budgets.length > 0) {
        for (const budget of budgets) {
          const [categorySpend] = await conn.execute<any[]>(
            `SELECT SUM(amount_minor) as total FROM expenses 
             WHERE user_id = ? AND category_id = ?
             AND YEAR(expense_date) = ? 
             AND MONTH(expense_date) = ?`,
            [user.id, budget.category_id, currentYear2, currentMonth2]
          );
          const spent = Number(categorySpend[0]?.total || '0');
          const limit = Number(budget.limit_minor);
          const percentage = limit > 0 ? (spent / limit) * 100 : 0;
          const exceeded = spent > limit;
          
          if (exceeded) budgetsExceeded++;
          
          console.log(`   - ${budget.category}:`);
          console.log(`     Limit: ${limit / 100}, Spent: ${spent / 100}, Usage: ${percentage.toFixed(1)}%`);
          console.log(`     ${exceeded ? '❌ EXCEEDED' : '✅ OK'}`);
        }
        
        const adherenceRate = budgets.length > 0 
          ? ((budgets.length - budgetsExceeded) / budgets.length) * 100 
          : 0;
        
        if (adherenceRate === 100) budgetScore = 30;
        else if (adherenceRate >= 75) budgetScore = 20;
        else if (adherenceRate >= 50) budgetScore = 10;
        else budgetScore = 0;
        
        console.log('   Adherence Rate:', adherenceRate.toFixed(1), '%');
        console.log('   ➜ Budget Score:', budgetScore, '/ 30');
        
        if (budgetsExceeded > 0) {
          console.log(`   ⚠️  EXPECTED RECOMMENDATION: ${budgetsExceeded} budget(s) exceeded`);
        } else {
          console.log('   ✅ All budgets adhered - NO recommendation expected');
        }
      } else {
        budgetScore = 0;
        console.log('   ⚠️  NO BUDGETS SET');
        console.log('   ➜ Budget Score: 0 / 30');
        console.log('   ⚠️  EXPECTED RECOMMENDATION: Set monthly budgets');
      }
      console.log('\n');

      // 3. STABILITY COMPONENT (max 20 points)
      console.log('📈 SPENDING STABILITY COMPONENT (Max: 20 points)');
      const [last3Months] = await conn.execute<any[]>(
        `SELECT 
           DATE_FORMAT(expense_date, '%Y-%m') as month,
           SUM(amount_minor) as total
         FROM expenses 
         WHERE user_id = ?
         AND expense_date >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)
         GROUP BY DATE_FORMAT(expense_date, '%Y-%m')
         ORDER BY month DESC`,
        [user.id]
      );
      
      console.log('   Last 3 Months Data:');
      const monthlySpends = last3Months.map((m: any) => Number(m.total));
      last3Months.forEach((m: any) => {
        console.log(`   - ${m.month}: ${Number(m.total) / 100}`);
      });
      
      let stabilityScore = 0;
      if (monthlySpends.length >= 3) {
        const avg = monthlySpends.reduce((a, b) => a + b, 0) / monthlySpends.length;
        const variance = monthlySpends.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / monthlySpends.length;
        const stdDev = Math.sqrt(variance);
        const cv = avg > 0 ? (stdDev / avg) * 100 : 0;
        
        console.log('   Average:', avg / 100);
        console.log('   Std Dev:', stdDev / 100);
        console.log('   Coefficient of Variation:', cv.toFixed(2), '%');
        
        if (cv < 10) stabilityScore = 20;
        else if (cv < 20) stabilityScore = 15;
        else if (cv < 30) stabilityScore = 10;
        else stabilityScore = 5;
        
        console.log('   ➜ Stability Score:', stabilityScore, '/ 20');
        
        if (stabilityScore < 20) {
          console.log('   ⚠️  EXPECTED RECOMMENDATION: Reduce spending volatility');
        } else {
          console.log('   ✅ Stable spending - NO recommendation expected');
        }
      } else {
        stabilityScore = 10; // Default for insufficient data
        console.log('   ℹ️  Insufficient data (< 3 months)');
        console.log('   ➜ Stability Score: 10 / 20 (default)');
      }
      console.log('\n');

      // 4. GOAL COMPONENT (max 10 points)
      console.log('🎯 GOAL PROGRESS COMPONENT (Max: 10 points)');
      const [goals] = await conn.execute<any[]>(
        `SELECT * FROM goals WHERE user_id = ? AND status = 'active'`,
        [user.id]
      );
      
      console.log('   Active Goals:', goals.length);
      
      let goalScore = 0;
      if (goals.length > 0) {
        let goalsOnTrack = 0;
        for (const goal of goals) {
          const target = Number(goal.target_minor);
          const saved = Number(goal.saved_minor);
          const progress = target > 0 ? (saved / target) * 100 : 0;
          const onTrack = progress >= 10; // Arbitrary threshold
          
          if (onTrack) goalsOnTrack++;
          
          console.log(`   - ${goal.name}:`);
          console.log(`     Target: ${target / 100}, Saved: ${saved / 100}, Progress: ${progress.toFixed(1)}%`);
          console.log(`     ${onTrack ? '✅ On Track' : '⚠️  Behind'}`);
        }
        
        const goalRate = (goalsOnTrack / goals.length) * 100;
        
        if (goalRate === 100) goalScore = 10;
        else if (goalRate >= 50) goalScore = 5;
        else goalScore = 0;
        
        console.log('   Goals On Track:', goalRate.toFixed(1), '%');
        console.log('   ➜ Goal Score:', goalScore, '/ 10');
        
        if (goalScore < 10) {
          console.log('   ⚠️  EXPECTED RECOMMENDATION: Review goal progress');
        } else {
          console.log('   ✅ All goals on track - NO recommendation expected');
        }
      } else {
        goalScore = 10; // No penalty for not having goals
        console.log('   ℹ️  No active goals');
        console.log('   ➜ Goal Score: 10 / 10 (no penalty)');
      }
      console.log('\n');

      // TOTAL SCORE
      const totalScore = savingsScore + budgetScore + stabilityScore + goalScore;
      console.log('═'.repeat(60));
      console.log('TOTAL FINANCIAL HEALTH SCORE');
      console.log('═'.repeat(60));
      console.log('Savings:   ', savingsScore, '/ 40');
      console.log('Budget:    ', budgetScore, '/ 30');
      console.log('Stability: ', stabilityScore, '/ 20');
      console.log('Goals:     ', goalScore, '/ 10');
      console.log('─'.repeat(60));
      console.log('TOTAL:     ', totalScore, '/ 100');
      console.log('═'.repeat(60));
      console.log('\n');

      console.log('⚠️  TO VALIDATE: Compare with API /api/health and UI display');
      console.log('⚠️  TO VALIDATE: Verify recommendations match component deductions');
      console.log('\n');
    }

    // =================================================================
    // PHASE 5 — GOALS PAGE VALIDATION
    // =================================================================
    console.log('\n');
    console.log('='.repeat(80));
    console.log('PHASE 5 — GOALS PAGE VALIDATION');
    console.log('='.repeat(80));
    console.log('\n');

    for (const user of users) {
      console.log(`Analyzing Goals for User: ${user.name} (ID: ${user.id})`);
      console.log('─'.repeat(80));
      console.log('\n');

      const [goals] = await conn.execute<any[]>(
        'SELECT * FROM goals WHERE user_id = ? ORDER BY created_at DESC',
        [user.id]
      );

      if (goals.length === 0) {
        console.log('   No goals found for this user.');
        console.log('\n');
        continue;
      }

      // Calculate actual savings history
      const [savingsHistory] = await conn.execute<any[]>(
        `SELECT 
           DATE_FORMAT(expense_date, '%Y-%m') as month,
           SUM(amount_minor) as spent
         FROM expenses 
         WHERE user_id = ?
         GROUP BY DATE_FORMAT(expense_date, '%Y-%m')
         ORDER BY month DESC
         LIMIT 6`,
        [user.id]
      );

      const monthlyIncome = Number(user.monthly_income_minor);
      const avgMonthlySavings = savingsHistory.length > 0
        ? savingsHistory.reduce((sum: number, m: any) => {
            return sum + (monthlyIncome - Number(m.spent));
          }, 0) / savingsHistory.length
        : 0;

      const dailySavingsRate = avgMonthlySavings / 30;

      console.log('📊 SAVINGS CONTEXT:');
      console.log('   Monthly Income:', monthlyIncome / 100);
      console.log('   Avg Monthly Savings:', avgMonthlySavings / 100);
      console.log('   Daily Savings Rate:', dailySavingsRate / 100);
      console.log('\n');

      for (const goal of goals) {
        console.log('🎯 GOAL:', goal.name);
        console.log('─'.repeat(60));

        const target = Number(goal.target_minor);
        const saved = Number(goal.saved_minor);
        const remaining = target - saved;
        const deadline = new Date(goal.deadline);
        const today = new Date();
        const daysLeft = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const progress = target > 0 ? (saved / target) * 100 : 0;

        console.log('   Target (minor):', target, '→', target / 100);
        console.log('   Saved (minor):', saved, '→', saved / 100);
        console.log('   Remaining (minor):', remaining, '→', remaining / 100);
        console.log('   Deadline:', goal.deadline);
        console.log('   Days Left:', daysLeft);
        console.log('   Progress:', progress.toFixed(2), '%');
        console.log('\n');

        // CRITICAL CHECK: Completion status
        const shouldBeComplete = saved >= target;
        const isMarkedComplete = goal.status === 'completed';

        console.log('   COMPLETION CHECK:');
        console.log('   saved_minor >= target_minor?', saved, '>=', target, '→', shouldBeComplete);
        console.log('   Actual Status:', goal.status);
        
        if (shouldBeComplete && !isMarkedComplete) {
          console.log('   🐛 BUG: Goal should be "completed" but is marked as:', goal.status);
        } else if (!shouldBeComplete && isMarkedComplete) {
          console.log('   🐛 BUG: Goal is marked "completed" but saved < target');
        } else {
          console.log('   ✅ Status is correct');
        }
        console.log('\n');

        // Probability calculation
        if (daysLeft > 0 && remaining > 0) {
          const requiredDailyRate = remaining / daysLeft;
          const probability = dailySavingsRate > 0 
            ? Math.min((dailySavingsRate / requiredDailyRate) * 100, 100)
            : 0;

          console.log('   PROBABILITY CALCULATION:');
          console.log('   Required Daily Rate:', requiredDailyRate / 100);
          console.log('   Actual Daily Rate:', dailySavingsRate / 100);
          console.log('   Probability Formula: (actual / required) * 100');
          console.log('   Calculated Probability:', probability.toFixed(2), '%');
          console.log('   ⏳ TO VALIDATE: Compare with API probability value');
        } else if (daysLeft <= 0) {
          console.log('   ⚠️  Goal deadline has passed');
        } else {
          console.log('   ✅ Goal already achieved');
        }
        console.log('\n');
      }
    }

    console.log('\n');
    console.log('='.repeat(80));
    console.log('AUDIT PHASE 1-5 COMPLETE');
    console.log('='.repeat(80));
    console.log('\n');
    console.log('⚠️  NEXT STEPS:');
    console.log('1. Run the application and access Reports, Insights, Goals pages');
    console.log('2. Compare UI values with DB values shown above');
    console.log('3. Check API responses match DB queries');
    console.log('4. Identify any MISMATCH between layers');
    console.log('\n');

  } catch (error: any) {
    console.error('❌ Audit failed:', error.message);
    console.error(error);
  } finally {
    await conn.end();
    console.log('Database connection closed.');
  }
}

main().catch(console.error);
