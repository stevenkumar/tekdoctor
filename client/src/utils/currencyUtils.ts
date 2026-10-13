import React from 'react';

/**
 * Utility functions for clean, direct numeric currency (INR ₹) inputs.
 * Ensures:
 * - Direct keyboard entry (1, 2, 3, 100, 200, 300, 1000, 2000, 3000, etc.)
 * - Disables and prevents number spinner increment/decrement behavior
 * - Rejects letters, negative values, and invalid characters
 * - Restricts decimal precision to max 2 places (paisa)
 * - Restricts maximum amount to ₹10,000,000 (1 crore)
 */

/**
 * Sanitizes typed or pasted input for currency fields:
 * - Keeps only digits and at most one decimal point.
 * - Truncates excess decimal precision beyond 2 decimal places.
 * - Removes leading zeros before an integer digit (e.g. '01' -> '1', '0100' -> '100'),
 *   while preserving '0' and '0.xx'.
 * - Clamps at maximum ₹10,000,000.
 */
export const sanitizeAmountInput = (value: string): string => {
  if (!value) return '';

  // 1. Remove all characters except digits (0-9) and dot (.)
  let cleaned = value.replace(/[^0-9.]/g, '');

  // 2. Allow at most one decimal point
  const firstDotIndex = cleaned.indexOf('.');
  if (firstDotIndex !== -1) {
    const beforeDot = cleaned.substring(0, firstDotIndex);
    const afterDot = cleaned.substring(firstDotIndex + 1).replace(/\./g, '');
    cleaned = `${beforeDot}.${afterDot.slice(0, 2)}`;
  }

  // 3. Normalize leading zeros: '05' -> '5', '00100' -> '100', but allow '0' or '0.5'
  if (/^0[0-9]/.test(cleaned)) {
    cleaned = cleaned.replace(/^0+/, '');
    if (cleaned === '' || cleaned.startsWith('.')) {
      cleaned = '0' + cleaned;
    }
  }

  // 4. Enforce max limit: ₹10,000,000
  const num = parseFloat(cleaned);
  if (!isNaN(num) && num > 10000000) {
    return '10000000';
  }

  return cleaned;
};

/**
 * KeyDown handler to prevent invalid keystrokes, spinner increments,
 * signs (+/-), exponent characters (e/E), and excess decimal typing.
 */
export const handleAmountKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
  // 1. Block arrow up / arrow down (behavioral spinner replacement)
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    return;
  }

  // 2. Allow navigation & editing keys
  const allowedKeys = [
    'Backspace',
    'Delete',
    'Tab',
    'Escape',
    'Enter',
    'ArrowLeft',
    'ArrowRight',
    'Home',
    'End'
  ];
  if (allowedKeys.includes(e.key)) {
    return;
  }

  // 3. Allow standard shortcuts (Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+Z, Meta+A, etc.)
  if (e.ctrlKey || e.metaKey) {
    return;
  }

  // 4. Block signs and exponents immediately
  if (['-', '+', 'e', 'E'].includes(e.key)) {
    e.preventDefault();
    return;
  }

  // 5. Handle decimal point (.)
  if (e.key === '.') {
    const input = e.currentTarget;
    const val = input.value;
    const start = input.selectionStart ?? val.length;
    const end = input.selectionEnd ?? val.length;
    const hasSelectedExistingDot = val.indexOf('.') >= start && val.indexOf('.') < end;
    if (val.includes('.') && !hasSelectedExistingDot) {
      e.preventDefault();
    }
    return;
  }

  // 6. Block any non-digit character
  if (!/^[0-9]$/.test(e.key)) {
    e.preventDefault();
    return;
  }

  // 7. Enforce max 2 decimal places when typing after the dot
  const input = e.currentTarget;
  const val = input.value;
  const start = input.selectionStart ?? val.length;
  const end = input.selectionEnd ?? val.length;
  const dotIndex = val.indexOf('.');

  if (dotIndex !== -1 && start > dotIndex && start === end) {
    const decimals = val.slice(dotIndex + 1);
    if (decimals.length >= 2) {
      e.preventDefault();
    }
  }
};
