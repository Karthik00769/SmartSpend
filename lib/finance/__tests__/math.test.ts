import { expect, test, describe } from 'vitest';
import { inrToPaise, paiseToInr, calculatePercentage, calculateRemaining } from '../calculations/math';

describe('Financial Math (Paise Conversion)', () => {
  test('inrToPaise correctly handles typical inputs', () => {
    expect(inrToPaise(10.50)).toBe(1050);
    expect(inrToPaise(100)).toBe(10000);
    expect(inrToPaise(0.01)).toBe(1);
    expect(inrToPaise(0)).toBe(0);
  });

  test('inrToPaise prevents floating point anomalies', () => {
    // 0.14 * 100 in JS usually results in 14.000000000000002
    expect(inrToPaise(0.14)).toBe(14);
    // 0.29 * 100 in JS usually results in 28.999999999999996
    expect(inrToPaise(0.29)).toBe(29);
  });

  test('paiseToInr correctly handles typical inputs', () => {
    expect(paiseToInr(1050)).toBe(10.50);
    expect(paiseToInr(1)).toBe(0.01);
    expect(paiseToInr(0)).toBe(0);
  });

  test('paiseToInr throws on non-integer input', () => {
    expect(() => paiseToInr(10.5)).toThrowError('Paise value must be a strict integer');
  });
});

describe('Financial Math (Percentage)', () => {
  test('calculatePercentage handles normal calculations', () => {
    expect(calculatePercentage(50, 100)).toBe(50);
    expect(calculatePercentage(100, 100)).toBe(100);
    expect(calculatePercentage(150, 100)).toBe(150);
  });

  test('calculatePercentage safely handles division by zero', () => {
    expect(calculatePercentage(50, 0)).toBe(0);
  });
});

describe('Financial Math (Remaining)', () => {
  test('calculateRemaining calculates correctly', () => {
    expect(calculateRemaining(1000, 500)).toBe(500);
  });

  test('calculateRemaining does not return negative values', () => {
    expect(calculateRemaining(500, 1000)).toBe(0);
  });
});
