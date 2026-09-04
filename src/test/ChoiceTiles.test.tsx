import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ChoiceTiles from '../components/common/ChoiceTiles';

const choices = ['By the pond', 'In a tree', 'At school'];

describe('ChoiceTiles', () => {
  it('renders every choice as a button', () => {
    render(<ChoiceTiles choices={choices} selectedIndex={null} onSelect={() => {}} />);
    for (const choice of choices) {
      expect(screen.getByRole('button', { name: new RegExp(choice) })).toBeInTheDocument();
    }
  });

  it('reports the tapped index', () => {
    const onSelect = vi.fn();
    render(<ChoiceTiles choices={choices} selectedIndex={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /In a tree/ }));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('marks the selected tile as pressed', () => {
    render(<ChoiceTiles choices={choices} selectedIndex={2} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: /At school/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /In a tree/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('locks the tiles once the answer is revealed', () => {
    const onSelect = vi.fn();
    render(<ChoiceTiles choices={choices} selectedIndex={1} correctIndex={0} revealed onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /At school/ }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('shows a tick on the correct answer and a cross on a wrong pick', () => {
    render(<ChoiceTiles choices={choices} selectedIndex={1} correctIndex={0} revealed onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: /By the pond/ })).toHaveTextContent('✓');
    expect(screen.getByRole('button', { name: /In a tree/ })).toHaveTextContent('✕');
  });

  it('still marks the correct answer when the child got it right', () => {
    render(<ChoiceTiles choices={choices} selectedIndex={0} correctIndex={0} revealed onSelect={() => {}} />);
    const correct = screen.getByRole('button', { name: /By the pond/ });
    expect(correct).toHaveTextContent('✓');
    expect(correct).not.toHaveTextContent('✕');
  });

  it('labels the group for screen readers', () => {
    render(<ChoiceTiles choices={choices} selectedIndex={null} onSelect={() => {}} label="Pick the answer" />);
    expect(screen.getByRole('group', { name: 'Pick the answer' })).toBeInTheDocument();
  });

  it('renders nothing but the group for an empty choice list', () => {
    render(<ChoiceTiles choices={[]} selectedIndex={null} onSelect={() => {}} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
