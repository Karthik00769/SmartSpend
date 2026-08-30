import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Goals } from '../index'; // index exports Goals which is calculations/goals.ts

describe('FinanceCore.Goals', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('calculateGoalProgress', () => {
    it('returns 0 when no savings', () => {
      expect(Goals.calculateGoalProgress(0, 100000)).toBe(0);
    });

    it('returns 50 when half saved', () => {
      expect(Goals.calculateGoalProgress(50000, 100000)).toBe(50);
    });

    it('returns 100 when exactly saved', () => {
      expect(Goals.calculateGoalProgress(100000, 100000)).toBe(100);
    });

    it('returns >100 when over-saved', () => {
      expect(Goals.calculateGoalProgress(150000, 100000)).toBe(150);
    });

    it('handles target amount 0', () => {
      expect(Goals.calculateGoalProgress(50000, 0)).toBe(100);
    });
  });

  describe('calculateGoalRemaining', () => {
    it('returns exact difference', () => {
      expect(Goals.calculateGoalRemaining(2000, 5000)).toBe(3000);
    });
    
    it('returns 0 if already exceeded', () => {
      expect(Goals.calculateGoalRemaining(6000, 5000)).toBe(0);
    });
  });

  describe('isGoalCompleted', () => {
    it('returns false when savings are less than target', () => {
      expect(Goals.isGoalCompleted(4000, 5000)).toBe(false);
    });
    it('returns true when savings meet target', () => {
      expect(Goals.isGoalCompleted(5000, 5000)).toBe(true);
    });
    it('returns true when savings exceed target', () => {
      expect(Goals.isGoalCompleted(6000, 5000)).toBe(true);
    });
  });
  
  describe('calculateRequiredMonthlySavings', () => {
    it('calculates savings needed linearly', () => {
      expect(Goals.calculateRequiredMonthlySavings(100000, 5)).toBe(20000);
    });
    it('returns total remaining if less than a month', () => {
      expect(Goals.calculateRequiredMonthlySavings(50000, 0)).toBe(50000);
    });
    it('returns 0 if no remaining paise', () => {
      expect(Goals.calculateRequiredMonthlySavings(0, 5)).toBe(0);
    });
    it('rounds up to nearest integer paise', () => {
      expect(Goals.calculateRequiredMonthlySavings(100000, 3)).toBe(33334);
    });
  });

  describe('calculateGoalStatus', () => {
    it('returns completed if goal met regardless of date', () => {
      const status = Goals.calculateGoalStatus(100000, 100000, '2024-12-31T00:00:00Z');
      expect(status).toBe('completed');
    });

    it('returns overdue if date has passed and goal not met', () => {
      const now = new Date('2024-06-15T12:00:00Z');
      vi.setSystemTime(now);
      const status = Goals.calculateGoalStatus(50000, 100000, '2024-05-15T12:00:00Z');
      expect(status).toBe('overdue');
    });

    it('returns on_track for active goals in the future', () => {
      const now = new Date('2024-06-15T12:00:00Z');
      vi.setSystemTime(now);
      const status = Goals.calculateGoalStatus(50000, 100000, '2024-07-15T12:00:00Z');
      expect(status).toBe('on_track');
    });
  });
});
