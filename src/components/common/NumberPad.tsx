/**
 * NumberPad — large-target numeric entry.
 *
 * A phone keyboard is a poor fit for a six-year-old: the keys are small, the
 * numbers are a secondary layer, and it covers the question. This is a
 * self-contained pad with child-sized targets that keeps the problem visible.
 *
 * Used by math practice, word problems and the fact drill.
 */

import React, { useCallback } from 'react';

export interface NumberPadProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** Allow a decimal point (grade 5 decimals, fraction answers). */
  allowDecimal?: boolean;
  /** Allow a leading minus sign. */
  allowNegative?: boolean;
  disabled?: boolean;
  submitLabel?: string;
  /** Maximum number of characters. */
  maxLength?: number;
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

const KEY_CLASS =
  'h-14 md:h-16 rounded-2xl text-2xl md:text-3xl font-extrabold transition-transform ' +
  'active:scale-95 disabled:opacity-40 disabled:active:scale-100';

const NumberPad: React.FC<NumberPadProps> = ({
  value,
  onChange,
  onSubmit,
  allowDecimal = false,
  allowNegative = false,
  disabled = false,
  submitLabel = 'Check answer',
  maxLength = 8,
}) => {
  const append = useCallback((char: string) => {
    if (disabled) return;
    if (value.length >= maxLength) return;
    if (char === '.' && value.includes('.')) return;
    if (char === '.' && value === '') { onChange('0.'); return; }
    onChange(value + char);
  }, [disabled, maxLength, onChange, value]);

  const backspace = useCallback(() => {
    if (disabled) return;
    onChange(value.slice(0, -1));
  }, [disabled, onChange, value]);

  const toggleSign = useCallback(() => {
    if (disabled) return;
    onChange(value.startsWith('-') ? value.slice(1) : `-${value}`);
  }, [disabled, onChange, value]);

  return (
    <div className="w-full">
      <output
        aria-live="polite"
        aria-label="Your answer"
        className="block w-full min-h-16 md:min-h-20 rounded-2xl border-2 border-violet-200 bg-white
                   px-4 py-3 text-center text-3xl md:text-4xl font-extrabold text-gray-800"
      >
        {value === '' ? <span className="text-gray-300">?</span> : value}
      </output>

      <div className="grid grid-cols-3 gap-2 md:gap-3 mt-3">
        {DIGITS.map((digit) => (
          <button
            key={digit}
            type="button"
            disabled={disabled}
            onClick={() => append(digit)}
            aria-label={digit}
            className={`${KEY_CLASS} bg-white border-2 border-violet-100 text-violet-700 active:bg-violet-50`}
          >
            {digit}
          </button>
        ))}

        {allowDecimal ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => append('.')}
            aria-label="decimal point"
            className={`${KEY_CLASS} bg-white border-2 border-violet-100 text-violet-700 active:bg-violet-50`}
          >
            .
          </button>
        ) : allowNegative ? (
          <button
            type="button"
            disabled={disabled}
            onClick={toggleSign}
            aria-label="plus or minus"
            className={`${KEY_CLASS} bg-white border-2 border-violet-100 text-violet-700 active:bg-violet-50`}
          >
            ±
          </button>
        ) : (
          <span aria-hidden="true" />
        )}

        <button
          type="button"
          disabled={disabled}
          onClick={() => append('0')}
          aria-label="0"
          className={`${KEY_CLASS} bg-white border-2 border-violet-100 text-violet-700 active:bg-violet-50`}
        >
          0
        </button>

        <button
          type="button"
          disabled={disabled || value.length === 0}
          onClick={backspace}
          aria-label="Delete"
          className={`${KEY_CLASS} bg-gray-100 text-gray-500 active:bg-gray-200`}
        >
          ⌫
        </button>
      </div>

      <button
        type="button"
        disabled={disabled || value.trim() === '' || value === '-'}
        onClick={onSubmit}
        className="w-full mt-3 py-4 rounded-2xl bg-violet-600 text-white text-lg md:text-xl font-bold
                   active:bg-violet-700 disabled:bg-violet-200 disabled:text-violet-400 transition-colors"
      >
        {submitLabel}
      </button>
    </div>
  );
};

export default NumberPad;
