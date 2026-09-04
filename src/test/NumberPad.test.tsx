import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import NumberPad from '../components/common/NumberPad';

/** Wrapper that owns the value, mirroring real usage. */
function Harness(props: Partial<React.ComponentProps<typeof NumberPad>> = {}) {
  const [value, setValue] = useState(props.value ?? '');
  return (
    <NumberPad
      value={value}
      onChange={setValue}
      onSubmit={props.onSubmit ?? (() => {})}
      allowDecimal={props.allowDecimal}
      allowNegative={props.allowNegative}
      disabled={props.disabled}
      maxLength={props.maxLength}
      submitLabel={props.submitLabel}
    />
  );
}

const tap = (label: string) => fireEvent.click(screen.getByRole('button', { name: label }));

describe('NumberPad', () => {
  it('builds a number from taps', () => {
    render(<Harness />);
    tap('4');
    tap('2');
    expect(screen.getByLabelText('Your answer')).toHaveTextContent('42');
  });

  it('shows a placeholder before anything is entered', () => {
    render(<Harness />);
    expect(screen.getByLabelText('Your answer')).toHaveTextContent('?');
  });

  it('deletes the last digit', () => {
    render(<Harness />);
    tap('4');
    tap('2');
    tap('Delete');
    expect(screen.getByLabelText('Your answer')).toHaveTextContent('4');
  });

  it('disables delete when there is nothing to remove', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  it('hides the decimal key unless decimals are allowed', () => {
    render(<Harness />);
    expect(screen.queryByRole('button', { name: 'decimal point' })).not.toBeInTheDocument();
  });

  it('allows a single decimal point when enabled', () => {
    render(<Harness allowDecimal />);
    tap('1');
    tap('decimal point');
    tap('5');
    tap('decimal point');
    expect(screen.getByLabelText('Your answer')).toHaveTextContent('1.5');
  });

  it('starts a bare decimal with a leading zero', () => {
    render(<Harness allowDecimal />);
    tap('decimal point');
    expect(screen.getByLabelText('Your answer')).toHaveTextContent('0.');
  });

  it('toggles a minus sign when negatives are allowed', () => {
    render(<Harness allowNegative />);
    tap('7');
    tap('plus or minus');
    expect(screen.getByLabelText('Your answer')).toHaveTextContent('-7');
    tap('plus or minus');
    expect(screen.getByLabelText('Your answer')).toHaveTextContent('7');
  });

  it('stops accepting digits at the maximum length', () => {
    render(<Harness maxLength={2} />);
    tap('1');
    tap('2');
    tap('3');
    expect(screen.getByLabelText('Your answer')).toHaveTextContent('12');
  });

  it('keeps submit disabled until something is entered', () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const submit = screen.getByRole('button', { name: 'Check answer' });
    expect(submit).toBeDisabled();
    tap('5');
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('does not accept a lone minus sign as an answer', () => {
    render(<Harness allowNegative />);
    tap('plus or minus');
    expect(screen.getByRole('button', { name: 'Check answer' })).toBeDisabled();
  });

  it('ignores taps while disabled', () => {
    render(<Harness disabled />);
    tap('5');
    expect(screen.getByLabelText('Your answer')).toHaveTextContent('?');
  });

  it('uses a caller-supplied submit label', () => {
    render(<Harness submitLabel="Go!" />);
    expect(screen.getByRole('button', { name: 'Go!' })).toBeInTheDocument();
  });

  it('announces the answer politely for screen readers', () => {
    render(<Harness />);
    expect(screen.getByLabelText('Your answer')).toHaveAttribute('aria-live', 'polite');
  });
});
