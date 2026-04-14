// User types
export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  createdAt: Date;
}

// Expense types
export interface Expense {
  id: string;
  userId: string;
  amount: number;
  category: string;
  description: string;
  date: Date;
  receipt?: string;
  createdAt: Date;
}

// Budget types
export interface Budget {
  id: string;
  userId: string;
  month: string; // YYYY-MM
  totalAmount: number;
  categories: BudgetCategory[];
  createdAt: Date;
}

export interface BudgetCategory {
  category: string;
  allocated: number;
  spent: number;
}

// Goal types
export interface Goal {
  id: string;
  userId: string;
  title: string;
  description?: string;
  targetAmount: number;
  savedAmount: number;
  deadline: Date;
  priority: 'low' | 'medium' | 'high';
  category?: string;
  createdAt: Date;
}

// Dashboard stats
export interface DashboardStats {
  totalIncome: number;
  totalExpenses: number;
  savings: number;
  budgetRemaining: number;
  currentMonth: string;
}

// Chart data
export interface ChartDataPoint {
  name: string;
  value: number;
  percentage?: number;
}

// Financial health score breakdown
export interface HealthScore {
  overall: number;
  budgetCompliance: number;
  savingsRate: number;
  goalProgress: number;
  debtRatio: number;
}
