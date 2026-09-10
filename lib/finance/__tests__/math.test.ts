import { expect, test, describe } from 'vitest';
import { inrToMinor, minorToInr, calculatePercentage, calculateRemaining } from '../calculations/math';

describe('Financial Math (minor Conversion)', () => {
  test('inrToMinor correctly handles typical inputs', () => {
    expect(inrToMinor(10.50)).toBe(1050);
    expect(inrToMinor(100)).toBe(10000);
    expect(inrToMinor(0.01)).toBe(1);
    expect(inrToMinor(0)).toBe(0);
  });

  test('inrToMinor prevents floating point anomalies', () => {
    // 0.14 * 100 in JS usually results in 14.000000000000002
    expect(inrToMinor(0.14)).toBe(14);
    // 0.29 * 100 in JS usually results in 28.999999999999996
    expect(inrToMinor(0.29)).toBe(29);
  });

  test('minorToInr correctly handles typical inputs', () => {
    expect(minorToInr(1050)).toBe(10.50);
    expect(minorToInr(1)).toBe(0.01);
    expect(minorToInr(0)).toBe(0);
  });

  test('minorToInr throws on non-integer input', () => {
    expect(() => minorToInr(10.5)).toThrowError('Minor value must be a strict integer');
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
