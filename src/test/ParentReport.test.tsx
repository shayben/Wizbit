import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/cosmosService', () => ({
  isCosmosConfigured: false,
  readDocument: vi.fn(),
  upsertDocument: vi.fn(),
  deleteDocument: vi.fn(),
  queryDocuments: vi.fn(),
}));

import ParentReport from '../components/ParentReport';
import { saveSession, updatePracticeWords } from '../services/progressService';
import { recordActivity } from '../services/dailyPlanService';
import type { ChildProfile } from '../services/profileService';

const UID = 'acct::kid';
const profile: ChildProfile = { id: 'kid', name: 'Maya', emoji: '🦊', grade: '3', createdAt: '' };

beforeEach(() => {
  localStorage.clear();
});

function renderReport(onClose = vi.fn()) {
  render(<ParentReport scopedUid={UID} profile={profile} onClose={onClose} />);
  return onClose;
}

describe('ParentReport', () => {
  it('shows a loading state first', () => {
    renderReport();
    expect(screen.getByText('Putting the week together…')).toBeInTheDocument();
  });

  it('titles the report with the learner’s name', async () => {
    renderReport();
    expect(await screen.findByText("Maya's week")).toBeInTheDocument();
  });

  it('says plainly when there was no activity', async () => {
    renderReport();
    expect(await screen.findByText(/No activity recorded this week/)).toBeInTheDocument();
  });

  it('summarises reading done this week', async () => {
    await saveSession(UID, 's1', 'The turtle story about a pond', 80, 4, 90, 120, 5, 4, ['because']);

    renderReport();
    await screen.findByText("Maya's week");
    expect(screen.getByText(/Read 1 passage/)).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
  });

  it('lists the words the child keeps missing', async () => {
    await updatePracticeWords(UID, ['because'], []);
    await saveSession(UID, 's1', 'A story', 80, 4, 90, 120, 5, 4, ['because']);

    renderReport();
    await screen.findByText("Maya's week");
    expect(screen.getByText('Words to watch')).toBeInTheDocument();
    expect(screen.getByText('because')).toBeInTheDocument();
  });

  it('always offers something concrete to try', async () => {
    renderReport();
    await screen.findByText("Maya's week");
    expect(screen.getByText('Try this week')).toBeInTheDocument();
  });

  it('counts the days the learner was active', async () => {
    await recordActivity(UID, 'read', 1);
    renderReport();
    await waitFor(() => expect(screen.getByText('1/7')).toBeInTheDocument());
  });

  it('closes back to the caller', async () => {
    const onClose = renderReport();
    await screen.findByText("Maya's week");
    fireEvent.click(screen.getByRole('button', { name: '← Back' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('falls back to a generic name when no profile is active', async () => {
    render(<ParentReport scopedUid={UID} profile={null} onClose={vi.fn()} />);
    expect(await screen.findByText("Your learner's week")).toBeInTheDocument();
  });
});
