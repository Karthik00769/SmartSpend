import { describe, it, expect } from 'vitest';
import * as Budget from '../calculations/budget';

describe('FinanceCore.Budget', () => {
  describe('calculateBudgetProgress', () => {
    it('returns 0 when allocated is 0', () => {
      expect(Budget.calculateBudgetProgress(100, 0)).toBe(0);
    });

    it('calculates the correct percentage', () => {
      expect(Budget.calculateBudgetProgress(500, 1000)).toBe(50);
      expect(Budget.calculateBudgetProgress(250, 1000)).toBe(25);
      expect(Budget.calculateBudgetProgress(1500, 1000)).toBe(150);
    });
  });

  describe('calculateRemainingBudget', () => {
    it('returns 0 when allocated is 0', () => {
      expect(Budget.calculateRemainingBudget(100, 0)).toBe(0);
    });

    it('returns the correct remaining amount', () => {
      expect(Budget.calculateRemainingBudget(500, 1000)).toBe(500);
      expect(Budget.calculateRemainingBudget(0, 1000)).toBe(1000);
    });

    it('returns 0 when overspent', () => {
      expect(Budget.calculateRemainingBudget(1500, 1000)).toBe(0);
    });
  });

  describe('isBudgetExceeded', () => {
    it('returns false when allocated is 0', () => {
      expect(Budget.isBudgetExceeded(100, 0)).toBe(false);
    });

    it('returns true when spent >= allocated', () => {
      expect(Budget.isBudgetExceeded(1000, 1000)).toBe(true);
      expect(Budget.isBudgetExceeded(1500, 1000)).toBe(true);
    });

    it('returns false when spent < allocated', () => {
      expect(Budget.isBudgetExceeded(999, 1000)).toBe(false);
    });
  });

  describe('needsBudgetAlert', () => {
    it('returns false when allocated is 0', () => {
      expect(Budget.needsBudgetAlert(100, 0)).toBe(false);
    });

    it('returns true when progress >= 80%', () => {
      expect(Budget.needsBudgetAlert(800, 1000)).toBe(true);
      expect(Budget.needsBudgetAlert(900, 1000)).toBe(true);
      expect(Budget.needsBudgetAlert(1500, 1000)).toBe(true);
    });

    it('returns false when progress < 80%', () => {
      expect(Budget.needsBudgetAlert(799, 1000)).toBe(false);
      expect(Budget.needsBudgetAlert(0, 1000)).toBe(false);
    });
  });

  describe('calculateBudgetStatus', () => {
    it('returns safe when allocated is 0', () => {
      expect(Budget.calculateBudgetStatus(100, 0)).toBe('safe');
    });

    it('returns exceeded when progress >= 100%', () => {
      expect(Budget.calculateBudgetStatus(1000, 1000)).toBe('exceeded');
      expect(Budget.calculateBudgetStatus(1500, 1000)).toBe('exceeded');
    });

    it('returns warning when progress >= 80% and < 100%', () => {
      expect(Budget.calculateBudgetStatus(800, 1000)).toBe('warning');
      expect(Budget.calculateBudgetStatus(999, 1000)).toBe('warning');
    });

    it('returns safe when progress < 80%', () => {
      expect(Budget.calculateBudgetStatus(799, 1000)).toBe('safe');
      expect(Budget.calculateBudgetStatus(0, 1000)).toBe('safe');
    });
  });
});
