export const EXPENSE_CATEGORIES = [
  { id: '1',  label: 'Food & Drinks',      icon: '🍔', color: 'bg-orange-100' },
  { id: '2',  label: 'Travel & Commute',   icon: '🚗', color: 'bg-blue-100' },
  { id: '3',  label: 'Home & Living',      icon: '🏠', color: 'bg-yellow-100' },
  { id: '4',  label: 'Entertainment',      icon: '🎭', color: 'bg-purple-100' },
  { id: '5',  label: 'Shopping & Retail', icon: '🛍️', color: 'bg-pink-100' },
  { id: '6',  label: 'Health & Wellness',  icon: '🏥', color: 'bg-red-100' },
  { id: '7',  label: 'Education',          icon: '🎓', color: 'bg-green-100' },
  { id: '8',  label: 'Subscriptions',      icon: '📱', color: 'bg-indigo-100' },
  { id: '9',  label: 'Work & Business',    icon: '💼', color: 'bg-gray-100' },
  { id: '10', label: 'Others',             icon: '📌', color: 'bg-slate-100' },
];

// Budget allocation suggestions
export const BUDGET_ALLOCATION = {
  housing: 30,
  food: 12,
  transport: 10,
  utilities: 8,
  entertainment: 6,
  shopping: 10,
  healthcare: 8,
  education: 5,
  other: 11,
};

// Goal types
export const GOAL_TYPES = [
  { id: 'short-term', label: 'Short-term (< 6 months)', duration: 6 },
  { id: 'medium-term', label: 'Medium-term (6-12 months)', duration: 12 },
  { id: 'long-term', label: 'Long-term (> 1 year)', duration: 24 },
];

// Sample goal templates
export const GOAL_TEMPLATES = [
  { id: 'emergency-fund', label: 'Emergency Fund', amount: 5000, priority: 'high' },
  { id: 'vacation', label: 'Vacation Fund', amount: 3000, priority: 'medium' },
  { id: 'gadget', label: 'New Gadget', amount: 1000, priority: 'low' },
  { id: 'car', label: 'Car Down Payment', amount: 20000, priority: 'high' },
  { id: 'house', label: 'House Down Payment', amount: 100000, priority: 'high' },
  { id: 'education', label: 'Education Fund', amount: 15000, priority: 'high' },
];

// Navigation links — ordered by usage frequency
export const NAV_LINKS = [
  { href: '/dashboard',        label: 'Dashboard',       icon: '📊' },
  { href: '/add-expense',      label: 'Add Expense',     icon: '➕' },
  { href: '/expenses-history', label: 'Expenses',        icon: '📜' },
  { href: '/budgets',          label: 'Budgets',         icon: '💰' },
  { href: '/goals',            label: 'Goals',           icon: '🎯' },
  { href: '/insights',         label: 'Insights',        icon: '🔍' },
  { href: '/reports',          label: 'Reports',         icon: '📈' },
  { href: '/settings',         label: 'Settings',        icon: '⚙️' },
];


// Animation duration constants (in milliseconds)
export const ANIMATION = {
  FADE: 200,
  SLIDE: 300,
  TRANSITION: 150,
};
