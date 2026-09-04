import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/cosmosService', () => ({
  isCosmosConfigured: false,
  readDocument: vi.fn(),
  upsertDocument: vi.fn(),
  deleteDocument: vi.fn(),
  queryDocuments: vi.fn(),
}));
vi.mock('../services/speechService', () => ({
  speakWord: vi.fn().mockResolvedValue(undefined),
  speakSound: vi.fn().mockResolvedValue(undefined),
  assessWord: vi.fn(() => ({ promise: Promise.resolve({ accuracyScore: 95 }), cancel: vi.fn() })),
}));

import WordSession from '../components/WordSession';
import { loadSightWordProgress } from '../services/sightWordService';
import { loadSpellingProgress } from '../services/spellingService';
import { loadDailyState } from '../services/dailyPlanService';
import { loadBuddyState } from '../services/buddyService';
import { updatePracticeWords } from '../services/progressService';

const UID = 'acct::kid';

beforeEach(() => {
  localStorage.clear();
});

const tap = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

describe('WordSession — sight words', () => {
  it('loads a session of sight words for the learner’s grade', async () => {
    render(<WordSession mode="sight-words" uid={UID} grade="1" size={2} onExit={vi.fn()} />);
    expect(await screen.findByText('⚡ Sight Words')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('records a correct word into the learner’s schedule', async () => {
    render(<WordSession mode="sight-words" uid={UID} grade="1" size={2} onExit={vi.fn()} />);
    await screen.findByText('⚡ Sight Words');

    tap('🎤 Practice this word');
    await screen.findByText('Nailed it!');

    await waitFor(async () => {
      const progress = await loadSightWordProgress(UID);
      expect(Object.keys(progress).length).toBe(1);
    });
  });

  it('credits the daily plan and awards buddy XP on completion', async () => {
    render(<WordSession mode="sight-words" uid={UID} grade="1" size={1} onExit={vi.fn()} />);
    await screen.findByText('⚡ Sight Words');

    tap('🎤 Practice this word');
    await screen.findByText('Nailed it!');
    tap('See results');

    expect(await screen.findByText('1 of 1 words')).toBeInTheDocument();

    const daily = await loadDailyState(UID);
    expect(Object.values(daily.days)[0]?.['sight-words']).toBe(1);
    expect((await loadBuddyState(UID)).xp).toBeGreaterThan(0);
  });

  it('keeps two learners’ schedules apart', async () => {
    render(<WordSession mode="sight-words" uid="acct::a" grade="1" size={1} onExit={vi.fn()} />);
    await screen.findByText('⚡ Sight Words');
    tap('🎤 Practice this word');
    await screen.findByText('Nailed it!');

    await waitFor(async () => {
      expect(Object.keys(await loadSightWordProgress('acct::a'))).toHaveLength(1);
    });
    expect(await loadSightWordProgress('acct::b')).toEqual({});
  });
});

describe('WordSession — spelling', () => {
  it('runs a dictation and records the result', async () => {
    render(<WordSession mode="spelling" uid={UID} grade="1" size={1} onExit={vi.fn()} />);
    await screen.findByText('✏️ Spelling');

    fireEvent.change(screen.getByLabelText('Spell the word you heard'), { target: { value: 'zzz' } });
    tap('Check spelling');
    await screen.findByText('Not quite');
    tap('See results');

    expect(await screen.findByText('0 of 1 words')).toBeInTheDocument();
    await waitFor(async () => {
      expect(Object.keys(await loadSpellingProgress(UID))).toHaveLength(1);
    });
  });
});

describe('WordSession — practice words', () => {
  it('tells the child there is nothing to practise when the list is empty', async () => {
    render(<WordSession mode="practice-words" uid={UID} grade="3" onExit={vi.fn()} />);
    expect(await screen.findByText('Nothing to practise right now!')).toBeInTheDocument();
  });

  it('drills words carried over from reading sessions, hardest first', async () => {
    await updatePracticeWords(UID, ['because', 'because', 'through'], []);

    render(<WordSession mode="practice-words" uid={UID} grade="3" size={2} onExit={vi.fn()} />);
    await screen.findByText('💪 Tricky Words');

    // "because" was missed twice, so it leads.
    expect(screen.getByText('because')).toBeInTheDocument();
  });

  it('clears a practice word once it is read correctly', async () => {
    await updatePracticeWords(UID, ['because'], []);

    render(<WordSession mode="practice-words" uid={UID} grade="3" size={1} onExit={vi.fn()} />);
    await screen.findByText('💪 Tricky Words');

    tap('🎤 Practice this word');
    await screen.findByText('Nailed it!');

    await waitFor(async () => {
      const { loadPracticeWords } = await import('../services/progressService');
      expect(await loadPracticeWords(UID)).toHaveLength(0);
    });
  });
});
