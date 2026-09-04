import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BuddyAwardToast from '../components/BuddyAwardToast';
import { BUDDIES, applyBuddyXp, xpForLevel, type BuddyState } from '../services/buddyService';

const fresh: BuddyState = { xp: 0, unlocked: [BUDDIES[0].id], activeBuddyId: BUDDIES[0].id };

describe('BuddyAwardToast', () => {
  it('renders nothing without an award', () => {
    const { container } = render(<BuddyAwardToast award={null} onDismiss={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the XP gained for an ordinary award', () => {
    render(<BuddyAwardToast award={applyBuddyXp(fresh, 12)} onDismiss={vi.fn()} />);
    expect(screen.getByRole('dialog')).toHaveTextContent('+12 XP');
  });

  it('announces a level-up', () => {
    render(<BuddyAwardToast award={applyBuddyXp(fresh, xpForLevel(1))} onDismiss={vi.fn()} />);
    expect(screen.getByRole('dialog')).toHaveTextContent('Level 2!');
  });

  it('announces a newly unlocked buddy with its tagline', () => {
    render(<BuddyAwardToast award={applyBuddyXp(fresh, BUDDIES[1].unlockXp)} onDismiss={vi.fn()} />);
    expect(screen.getByRole('dialog')).toHaveTextContent('New buddy unlocked!');
    expect(screen.getByRole('dialog')).toHaveTextContent(BUDDIES[1].tagline);
  });

  it('lists accessories unlocked by the level-up', () => {
    render(<BuddyAwardToast award={applyBuddyXp(fresh, xpForLevel(1))} onDismiss={vi.fn()} />);
    expect(screen.getByRole('dialog')).toHaveTextContent('Party hat');
  });

  it('shows how much XP the next level needs', () => {
    render(<BuddyAwardToast award={applyBuddyXp(fresh, 10)} onDismiss={vi.fn()} />);
    expect(screen.getByRole('dialog')).toHaveTextContent(/XP to level 2/);
  });

  it('dismisses on the button', () => {
    const onDismiss = vi.fn();
    render(<BuddyAwardToast award={applyBuddyXp(fresh, 10)} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: 'Keep going!' }));
    expect(onDismiss).toHaveBeenCalled();
  });
});
