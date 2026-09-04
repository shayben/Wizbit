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
  assessWord: vi.fn(() => ({ promise: Promise.resolve({ accuracyScore: 90 }), cancel: vi.fn() })),
}));
vi.mock('../services/ocrService', () => ({ recognizeText: vi.fn() }));
vi.mock('../services/ebookService', () => ({ extractFromEbook: vi.fn() }));
vi.mock('../data/momentCache', () => ({ ensureMomentCacheLoaded: vi.fn(), getCachedMoments: () => null }));

const auth = vi.hoisted(() => ({ user: null as { uid: string } | null }));
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: auth.user, loading: false, isConfigured: false,
    signInMicrosoft: vi.fn(), signInGoogle: vi.fn(), signOut: vi.fn(),
  }),
}));

import App from '../App';
import { ProfileProvider } from '../contexts/ProfileContext';
import { createProfile } from '../services/profileService';
import { recordActivity } from '../services/dailyPlanService';

function renderApp() {
  render(<ProfileProvider><App /></ProfileProvider>);
}

const tap = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

beforeEach(() => {
  localStorage.clear();
  auth.user = { uid: 'acct' };
});

describe('App — learner gate', () => {
  it('asks who is learning before showing any learning area', async () => {
    renderApp();
    expect(await screen.findByText("Who's learning?")).toBeInTheDocument();
    expect(screen.queryByText('Reading')).not.toBeInTheDocument();
  });

  it('goes to the home screen once a learner is chosen', async () => {
    await createProfile('acct', { name: 'Maya', grade: '3' });
    renderApp();

    expect(await screen.findByRole('button', { name: /Reading/ })).toBeInTheDocument();
    expect(screen.getByText('Maya')).toBeInTheDocument();
  });

  it('offers a way back to switch learners', async () => {
    await createProfile('acct', { name: 'Maya', grade: '3' });
    renderApp();

    await screen.findByRole('button', { name: /Reading/ });
    fireEvent.click(screen.getByText('Maya'));

    expect(await screen.findByText("Who's learning?")).toBeInTheDocument();
  });
});

describe('App — today’s plan', () => {
  it('shows the daily plan on the home screen', async () => {
    await createProfile('acct', { name: 'Maya', grade: '3' });
    renderApp();

    const plan = await screen.findByRole('region', { name: "Today's plan" });
    expect(plan).toBeInTheDocument();
    expect(plan).toHaveTextContent('Read a passage');
  });

  it('gives a first grader a shorter plan than a third grader', async () => {
    const first = await createProfile('acct', { name: 'Ben', grade: '1' });
    renderApp();

    const plan = await screen.findByRole('region', { name: "Today's plan" });
    expect(plan).toHaveTextContent('Sight words');
    expect(plan).not.toHaveTextContent('Word problems');
    expect(first.grade).toBe('1');
  });

  it('reflects completed work and shows the streak', async () => {
    const maya = await createProfile('acct', { name: 'Maya', grade: '3' });
    await recordActivity(`acct::${maya.id}`, 'read', 1);

    renderApp();
    const plan = await screen.findByRole('region', { name: "Today's plan" });
    await waitFor(() => expect(plan).toHaveTextContent('1-day streak'));
  });

  it('starts an activity from the plan', async () => {
    await createProfile('acct', { name: 'Maya', grade: '3' });
    renderApp();

    await screen.findByRole('region', { name: "Today's plan" });
    tap(/Math facts/);

    expect(await screen.findByText(/facts instant/)).toBeInTheDocument();
  });
});

describe('App — activity routes', () => {
  it('opens the fact drill', async () => {
    await createProfile('acct', { name: 'Maya', grade: '3' });
    renderApp();
    await screen.findByRole('button', { name: /Fact Power/ });
    tap(/Fact Power/);
    expect(await screen.findByText(/facts instant/)).toBeInTheDocument();
  });

  it('opens the sight-word drill', async () => {
    await createProfile('acct', { name: 'Ben', grade: '1' });
    renderApp();
    await screen.findByRole('button', { name: /Sight Words/ });
    tap(/Sight Words/);
    expect(await screen.findByText('⚡ Sight Words')).toBeInTheDocument();
  });

  it('opens spelling', async () => {
    await createProfile('acct', { name: 'Ben', grade: '1' });
    renderApp();
    await screen.findByRole('button', { name: /Spelling/ });
    tap(/Spelling/);
    expect(await screen.findByText('✏️ Spelling')).toBeInTheDocument();
  });

  it('opens the parent report', async () => {
    await createProfile('acct', { name: 'Maya', grade: '3' });
    renderApp();
    await screen.findByRole('button', { name: /Weekly report/ });
    tap(/Weekly report/);
    expect(await screen.findByText("Maya's week")).toBeInTheDocument();
  });

  it('explains that head-to-head needs a second learner', async () => {
    await createProfile('acct', { name: 'Maya', grade: '3' });
    renderApp();
    await screen.findByRole('button', { name: /Head to Head/ });
    tap(/Head to Head/);
    expect(await screen.findByText('Head-to-head needs two learners')).toBeInTheDocument();
  });

  it('runs head-to-head once two learners exist', async () => {
    await createProfile('acct', { name: 'Maya', grade: '3' });
    await createProfile('acct', { name: 'Ben', grade: '1' });
    renderApp();
    await screen.findByRole('button', { name: /Head to Head/ });
    tap(/Head to Head/);
    expect(await screen.findByRole('button', { name: 'Start the duel' })).toBeInTheDocument();
  });
});

describe('App — learner isolation', () => {
  it('shows each learner their own plan progress', async () => {
    const maya = await createProfile('acct', { name: 'Maya', grade: '3' });
    await createProfile('acct', { name: 'Ben', grade: '3' });
    await recordActivity(`acct::${maya.id}`, 'read', 1);

    // Ben is active (created last) and has done nothing today.
    renderApp();
    const plan = await screen.findByRole('region', { name: "Today's plan" });
    await waitFor(() => expect(plan).not.toHaveTextContent('1-day streak'));

    // Switch to Maya, whose work should show.
    fireEvent.click(screen.getByText('Ben'));
    fireEvent.click(await screen.findByRole('button', { name: 'Choose Maya' }));

    const mayaPlan = await screen.findByRole('region', { name: "Today's plan" });
    await waitFor(() => expect(mayaPlan).toHaveTextContent('1-day streak'));
  });
});

describe('App — story features follow the learner', () => {
  it('scopes the story library to the active learner', async () => {
    const maya = await createProfile('acct', { name: 'Maya', grade: '3' });
    const { saveStory, loadStories } = await import('../services/storyLibraryService');

    await saveStory({
      prompt: "Maya's Quest",
      readingLevel: '3',
      levelEmoji: '🌳',
      chapters: [],
      storyContext: { prompt: "Maya's Quest", readingLevel: '3', chapters: [] },
      completed: false,
    }, `acct::${maya.id}`);

    // The other learner's library stays empty.
    expect(await loadStories(`acct::other`)).toHaveLength(0);
    expect(await loadStories(`acct::${maya.id}`)).toHaveLength(1);
  });
});
