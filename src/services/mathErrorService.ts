/**
 * Wrong-answer diagnosis.
 *
 * A generic "try this strategy" tip is the same whether the child forgot to
 * regroup, subtracted in the wrong direction, or was one off. Naming the
 * actual mistake is what turns a miss into a teaching moment, and it is
 * usually recoverable from the numbers alone: the wrong answer a child gives
 * is rarely random.
 */

export type MathErrorKind =
  | 'off-by-one'
  | 'wrong-operation'
  | 'reversed-operands'
  | 'no-regroup'
  | 'place-value'
  | 'sign-direction'
  | 'digit-slip'
  | 'blank'
  | 'unknown';

export interface MathErrorDiagnosis {
  kind: MathErrorKind;
  /** Child-facing explanation of what probably happened. */
  message: string;
  /** What to do differently next time. */
  nextStep: string;
}

export interface DiagnoseInput {
  /** The two operands as presented, when known. */
  left?: number;
  right?: number;
  operation?: 'add' | 'sub' | 'mul' | 'div';
  expected: number;
  actual: number;
}

const MESSAGES: Record<MathErrorKind, { message: string; nextStep: string }> = {
  'off-by-one': {
    message: 'So close — you were just one away.',
    nextStep: 'Count once more slowly and check where you started counting.',
  },
  'wrong-operation': {
    message: 'That answer matches a different operation.',
    nextStep: 'Look at the sign in the middle before you start working it out.',
  },
  'reversed-operands': {
    message: 'It looks like the numbers got swapped around.',
    nextStep: 'In subtraction and division, order matters — start with the bigger total.',
  },
  'no-regroup': {
    message: 'It looks like a ten did not get carried or borrowed.',
    nextStep: 'When the ones column goes past 9, carry a ten into the next column.',
  },
  'place-value': {
    message: 'The digits are right but the size is off by a factor of ten.',
    nextStep: 'Check each digit is in the right column: ones, tens, hundreds.',
  },
  'sign-direction': {
    message: 'The answer came out on the wrong side of zero.',
    nextStep: 'Subtract the smaller number from the bigger one.',
  },
  'digit-slip': {
    message: 'The right digits are there, just in a different order.',
    nextStep: 'Read your answer back out loud before you submit it.',
  },
  blank: {
    message: 'Nothing was entered yet.',
    nextStep: 'Have a go — a wrong answer tells us more than a blank one.',
  },
  unknown: {
    message: 'Not quite this time.',
    nextStep: 'Work through it one step at a time and check each step.',
  },
};

function digitsOf(value: number): string {
  return Math.abs(value).toString().replace('.', '').split('').sort().join('');
}

function applyOperation(op: NonNullable<DiagnoseInput['operation']>, a: number, b: number): number {
  switch (op) {
    case 'add': return a + b;
    case 'sub': return a - b;
    case 'mul': return a * b;
    case 'div': return b === 0 ? Number.NaN : a / b;
  }
}

const EPSILON = 1e-9;
const near = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < EPSILON;

/**
 * Work out the most likely reason for a wrong answer.
 *
 * Checks run most-specific first so a genuinely diagnostic explanation wins
 * over a vaguer one that also happens to fit.
 */
export function diagnoseMathError(input: DiagnoseInput): MathErrorDiagnosis {
  const { expected, actual, left, right, operation } = input;

  const kind = classify();
  return { kind, ...MESSAGES[kind] };

  function classify(): MathErrorKind {
    if (!Number.isFinite(actual)) return 'blank';
    if (near(expected, actual)) return 'unknown';

    // Same magnitude, opposite sign: the child subtracted the smaller number
    // from the bigger one regardless of the order the problem asked for.
    if (operation === 'sub' && expected !== 0
      && Math.sign(expected) !== Math.sign(actual)
      && near(Math.abs(actual), Math.abs(expected))) {
      return 'sign-direction';
    }

    if (left !== undefined && right !== undefined) {
      // The child used the other operation.
      if (operation) {
        for (const other of ['add', 'sub', 'mul', 'div'] as const) {
          if (other === operation) continue;
          if (near(applyOperation(other, left, right), actual)) return 'wrong-operation';
        }
      }

      // Operands applied the wrong way round (only meaningful when it changes the result).
      if (operation && left !== right) {
        const swapped = applyOperation(operation, right, left);
        if (near(swapped, actual) && !near(swapped, expected)) return 'reversed-operands';
      }

      // Column addition without carrying: 27 + 15 → "312".
      if (operation === 'add' && concatColumns(left, right) === actual) return 'no-regroup';
    }

    if (Math.abs(expected - actual) === 1) return 'off-by-one';

    if (expected !== 0 && (near(actual, expected * 10) || near(actual, expected / 10))) {
      return 'place-value';
    }

    if (Number.isInteger(expected) && Number.isInteger(actual)
      && Math.abs(expected) >= 10 && digitsOf(expected) === digitsOf(actual)) {
      return 'digit-slip';
    }

    return 'unknown';
  }
}

/**
 * The classic un-regrouped column answer: add each column independently and
 * write the results side by side (27 + 15 → 3 and 12 → 312).
 */
function concatColumns(left: number, right: number): number {
  if (!Number.isInteger(left) || !Number.isInteger(right)) return Number.NaN;
  if (left < 10 || right < 10) return Number.NaN;
  const tens = Math.floor(left / 10) + Math.floor(right / 10);
  const ones = (left % 10) + (right % 10);
  if (ones < 10) return Number.NaN; // no regrouping was needed, so this is not the error
  return Number(`${tens}${ones}`);
}

/** Parse an operand pair out of a generated prompt like `7 × 8 = ?`. */
export function parsePrompt(prompt: string): { left: number; right: number; operation: DiagnoseInput['operation'] } | null {
  const match = prompt.match(/(-?\d+(?:\.\d+)?)\s*([+\-−*×/÷])\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const [, a, symbol, b] = match;
  const operation =
    symbol === '+' ? 'add'
    : symbol === '-' || symbol === '−' ? 'sub'
    : symbol === '*' || symbol === '×' ? 'mul'
    : 'div';
  return { left: Number(a), right: Number(b), operation };
}

/** Convenience wrapper: diagnose straight from a prompt string. */
export function diagnoseFromPrompt(prompt: string, expected: number, actual: number): MathErrorDiagnosis {
  const parsed = parsePrompt(prompt);
  return diagnoseMathError({ expected, actual, ...(parsed ?? {}) });
}
