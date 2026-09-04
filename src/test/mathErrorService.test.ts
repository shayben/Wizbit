import { describe, it, expect } from 'vitest';
import {
  diagnoseFromPrompt,
  diagnoseMathError,
  parsePrompt,
} from '../services/mathErrorService';

describe('diagnoseMathError', () => {
  it('spots an off-by-one count', () => {
    expect(diagnoseMathError({ expected: 12, actual: 11 }).kind).toBe('off-by-one');
    expect(diagnoseMathError({ expected: 12, actual: 13 }).kind).toBe('off-by-one');
  });

  it('spots the child using the wrong operation', () => {
    // 7 × 8 answered as 15 — that is 7 + 8.
    expect(diagnoseMathError({ left: 7, right: 8, operation: 'mul', expected: 56, actual: 15 }).kind)
      .toBe('wrong-operation');
  });

  it('spots reversed operands in division', () => {
    // 12 ÷ 4 answered as 0.333… — that is 4 ÷ 12.
    const result = diagnoseMathError({ left: 12, right: 4, operation: 'div', expected: 3, actual: 4 / 12 });
    expect(result.kind).toBe('reversed-operands');
  });

  it('spots a subtraction done in the wrong direction', () => {
    expect(diagnoseMathError({ left: 4, right: 9, operation: 'sub', expected: -5, actual: 5 }).kind)
      .toBe('sign-direction');
  });

  it('spots column addition without carrying', () => {
    // 27 + 15 = 42, but writing each column separately gives 312.
    expect(diagnoseMathError({ left: 27, right: 15, operation: 'add', expected: 42, actual: 312 }).kind)
      .toBe('no-regroup');
  });

  it('does not claim a regrouping error when no carry was needed', () => {
    expect(diagnoseMathError({ left: 21, right: 15, operation: 'add', expected: 36, actual: 99 }).kind)
      .not.toBe('no-regroup');
  });

  it('spots a place-value slip', () => {
    expect(diagnoseMathError({ expected: 56, actual: 560 }).kind).toBe('place-value');
    expect(diagnoseMathError({ expected: 560, actual: 56 }).kind).toBe('place-value');
  });

  it('spots transposed digits', () => {
    expect(diagnoseMathError({ expected: 56, actual: 65 }).kind).toBe('digit-slip');
  });

  it('reports a blank answer distinctly', () => {
    expect(diagnoseMathError({ expected: 10, actual: Number.NaN }).kind).toBe('blank');
  });

  it('falls back to a generic message when nothing fits', () => {
    expect(diagnoseMathError({ expected: 56, actual: 91 }).kind).toBe('unknown');
  });

  it('never claims an error for a correct answer', () => {
    expect(diagnoseMathError({ expected: 56, actual: 56 }).kind).toBe('unknown');
  });

  it('always returns a message and a next step', () => {
    const cases = [
      { expected: 12, actual: 11 },
      { expected: 10, actual: Number.NaN },
      { expected: 56, actual: 65 },
      { expected: 5, actual: 99 },
    ];
    for (const input of cases) {
      const result = diagnoseMathError(input);
      expect(result.message.length).toBeGreaterThan(0);
      expect(result.nextStep.length).toBeGreaterThan(0);
    }
  });

  it('does not report reversed operands when the operation is commutative', () => {
    // 3 + 5 and 5 + 3 are the same, so a swap cannot explain a wrong answer.
    expect(diagnoseMathError({ left: 3, right: 5, operation: 'add', expected: 8, actual: 8 }).kind)
      .toBe('unknown');
  });

  it('handles division by zero without crashing', () => {
    expect(() => diagnoseMathError({ left: 5, right: 0, operation: 'div', expected: 0, actual: 3 })).not.toThrow();
  });
});

describe('parsePrompt', () => {
  it('parses the generated prompt formats', () => {
    expect(parsePrompt('7 × 8 = ?')).toEqual({ left: 7, right: 8, operation: 'mul' });
    expect(parsePrompt('20 − 5 = ?')).toEqual({ left: 20, right: 5, operation: 'sub' });
    expect(parsePrompt('12 ÷ 4 = ?')).toEqual({ left: 12, right: 4, operation: 'div' });
    expect(parsePrompt('3 + 4 = ?')).toEqual({ left: 3, right: 4, operation: 'add' });
  });

  it('handles decimals', () => {
    expect(parsePrompt('1.5 + 2.5 = ?')).toEqual({ left: 1.5, right: 2.5, operation: 'add' });
  });

  it('returns null for a word problem or a non-arithmetic prompt', () => {
    expect(parsePrompt('How many sides does a triangle have?')).toBeNull();
  });
});

describe('diagnoseFromPrompt', () => {
  it('diagnoses straight from the prompt text', () => {
    expect(diagnoseFromPrompt('7 × 8 = ?', 56, 15).kind).toBe('wrong-operation');
  });

  it('still diagnoses when the prompt cannot be parsed', () => {
    expect(diagnoseFromPrompt('What number comes after 19?', 20, 19).kind).toBe('off-by-one');
  });
});
