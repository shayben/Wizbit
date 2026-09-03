import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import StoryPromptScreen from '../components/StoryPromptScreen';

const defaultProps = {
  readingLevel: '3',
  levelEmoji: '📘',
  levelLabel: 'Explorer',
  onStart: vi.fn(),
  onBack: vi.fn(),
};

describe('StoryPromptScreen', () => {
  it('combines multiple selected themes into one story prompt', () => {
    const onStart = vi.fn();
    render(<StoryPromptScreen {...defaultProps} onStart={onStart} />);

    fireEvent.click(screen.getByRole('button', { name: /Magic/ }));
    fireEvent.click(screen.getByRole('button', { name: /Mystery/ }));
    fireEvent.click(screen.getByRole('button', { name: /Ocean/ }));

    const prompt = screen.getByRole<HTMLTextAreaElement>('textbox');
    expect(prompt.value).toContain('young wizard');
    expect(prompt.value).toContain('young detective');
    expect(prompt.value).toContain('mermaid');
    expect(screen.getByRole('button', { name: /Magic/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Mystery/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Ocean/ })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: '🗺️ Begin Adventure!' }));
    expect(onStart).toHaveBeenCalledWith(expect.stringContaining('Combine all of these themes'));
  });

  it('removes a selected theme when it is clicked again', () => {
    render(<StoryPromptScreen {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /Magic/ }));
    fireEvent.click(screen.getByRole('button', { name: /Ocean/ }));
    fireEvent.click(screen.getByRole('button', { name: /Ocean/ }));

    const prompt = screen.getByRole<HTMLTextAreaElement>('textbox');
    expect(prompt.value).toContain('young wizard');
    expect(prompt.value).not.toContain('mermaid');
    expect(screen.getByRole('button', { name: /Ocean/ })).toHaveAttribute('aria-pressed', 'false');
  });
});
