import { describe, expect, it } from 'vitest';

import { sanitizeDecimalInput, sanitizeIntegerInput } from '../../data/numberInput';

describe('sanitizeDecimalInput', () => {
  it('treats a comma as a decimal separator', () => {
    expect(sanitizeDecimalInput('1,5')).toBe('1.5');
  });

  it('drops the minus sign instead of producing a negative value', () => {
    expect(sanitizeDecimalInput('-5')).toBe('5');
  });

  it('strips letters', () => {
    expect(sanitizeDecimalInput('abc')).toBe('');
  });

  it('keeps only the first decimal separator', () => {
    expect(sanitizeDecimalInput('1.2.3')).toBe('1.23');
  });

  it('preserves a partial value such as a trailing separator', () => {
    expect(sanitizeDecimalInput('17.')).toBe('17.');
  });

  it('keeps an empty input empty', () => {
    expect(sanitizeDecimalInput('')).toBe('');
  });

  it('limits the value to 7 characters', () => {
    expect(sanitizeDecimalInput('1234567890')).toBe('1234567');
  });
});

describe('sanitizeIntegerInput', () => {
  it('keeps digits only', () => {
    expect(sanitizeIntegerInput('12.5')).toBe('125');
  });

  it('drops the minus sign', () => {
    expect(sanitizeIntegerInput('-3')).toBe('3');
  });

  it('drops everything that is not a digit', () => {
    expect(sanitizeIntegerInput('12a3')).toBe('123');
    expect(sanitizeIntegerInput('')).toBe('');
  });

  it('limits the value to 4 characters', () => {
    expect(sanitizeIntegerInput('123456')).toBe('1234');
  });
});
