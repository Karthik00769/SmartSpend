export function calculateGoalProgress(savedMinor: number, targetMinor: number): number {
  if (targetMinor <= 0) return 0;
  return Math.min(100, Math.floor((savedMinor / targetMinor) * 100));
}

export function isGoalCompleted(savedMinor: number, targetMinor: number): boolean {
  return savedMinor >= targetMinor;
}

export function isGoalOverdue(savedMinor: number, targetMinor: number, targetDate: string | Date): boolean {
  if (savedMinor >= targetMinor) return false;
  const deadline = new Date(targetDate);
  const now = new Date();
  return deadline.getTime() < now.getTime();
}

export function formatMoney(amountMinor: number, currencyCode: string = 'USD'): string {
  const amount = amountMinor / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
  }).format(amount);
}
