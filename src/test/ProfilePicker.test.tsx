import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/cosmosService', () => ({
  isCosmosConfigured: false, readDocument: vi.fn(), upsertDocument: vi.fn(),
}));

const auth = vi.hoisted(() => ({ user: { uid: 'acct' } as { uid: string } | null }));
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: auth.user, loading: false, isConfigured: false }),
}));

import ProfilePicker from '../components/ProfilePicker';
import { ProfileProvider, useProfile } from '../contexts/ProfileContext';
import { MAX_PROFILES, createProfile } from '../services/profileService';

function renderPicker(onDone = vi.fn()) {
  render(
    <ProfileProvider>
      <ProfilePicker onDone={onDone} />
    </ProfileProvider>,
  );
  return onDone;
}

/** Reads the active scoped uid out of the provider, for assertions. */
function ScopeProbe() {
  const { scopedUid, grade } = useProfile();
  return <output data-testid="scope">{`${scopedUid}|${grade}`}</output>;
}

beforeEach(() => {
  localStorage.clear();
  auth.user = { uid: 'acct' };
});

async function addLearner(name: string, gradeLabel: string) {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${gradeLabel}$`) }));
  fireEvent.click(screen.getByRole('button', { name: 'Add learner' }));
}

describe('ProfilePicker', () => {
  it('opens straight into the add form for a brand-new account', async () => {
    renderPicker();
    await waitFor(() => expect(screen.getByLabelText('Name')).toBeInTheDocument());
  });

  it('creates a learner and reports completion', async () => {
    const onDone = renderPicker();
    await waitFor(() => expect(screen.getByLabelText('Name')).toBeInTheDocument());

    await addLearner('Maya', '3');

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(await screen.findByText('Maya')).toBeInTheDocument();
  });

  it('keeps the add button disabled until a name is typed', async () => {
    renderPicker();
    await waitFor(() => expect(screen.getByLabelText('Name')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Add learner' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ben' } });
    expect(screen.getByRole('button', { name: 'Add learner' })).toBeEnabled();
  });

  it('lists existing learners with their grade', async () => {
    await createProfile('acct', { name: 'Maya', grade: '3' });
    await createProfile('acct', { name: 'Ben', grade: '1' });
    renderPicker();

    expect(await screen.findByText('Maya')).toBeInTheDocument();
    expect(screen.getByText('Ben')).toBeInTheDocument();
    expect(screen.getByText('Grade 3')).toBeInTheDocument();
    expect(screen.getByText('Grade 1')).toBeInTheDocument();
  });

  it('switches the active learner when one is tapped', async () => {
    await createProfile('acct', { name: 'Maya', grade: '3' });
    const ben = await createProfile('acct', { name: 'Ben', grade: '1' });

    const onDone = vi.fn();
    render(
      <ProfileProvider>
        <ProfilePicker onDone={onDone} />
        <ScopeProbe />
      </ProfileProvider>,
    );

    // Ben was created last, so he is active; switch to Maya.
    await screen.findByText('Maya');
    fireEvent.click(screen.getByRole('button', { name: 'Choose Maya' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByTestId('scope')).not.toHaveTextContent(`acct::${ben.id}`),
    );
    expect(screen.getByTestId('scope')).toHaveTextContent('|3');
  });

  it('scopes storage per learner so siblings do not share progress', async () => {
    const maya = await createProfile('acct', { name: 'Maya', grade: '3' });
    render(
      <ProfileProvider>
        <ScopeProbe />
      </ProfileProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('scope')).toHaveTextContent(`acct::${maya.id}|3`),
    );
  });

  it('hides the add button once the account is full', async () => {
    for (let i = 0; i < MAX_PROFILES; i += 1) {
      await createProfile('acct', { name: `Kid ${i}`, grade: '1' });
    }
    renderPicker();
    await screen.findByText('Kid 0');
    expect(screen.queryByRole('button', { name: /Add learner/ })).not.toBeInTheDocument();
    expect(screen.getByText(`You have the maximum of ${MAX_PROFILES} learners.`)).toBeInTheDocument();
  });

  it('removes a learner after confirmation', async () => {
    await createProfile('acct', { name: 'Maya', grade: '3' });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPicker();

    await screen.findByText('Maya');
    fireEvent.click(screen.getByRole('button', { name: 'Remove Maya' }));

    await waitFor(() => expect(screen.queryByText('Maya')).not.toBeInTheDocument());
    confirmSpy.mockRestore();
  });

  it('keeps the learner when the removal is cancelled', async () => {
    await createProfile('acct', { name: 'Maya', grade: '3' });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPicker();

    await screen.findByText('Maya');
    fireEvent.click(screen.getByRole('button', { name: 'Remove Maya' }));

    expect(screen.getByText('Maya')).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it('works for a signed-out account too', async () => {
    auth.user = null;
    const onDone = renderPicker();
    await waitFor(() => expect(screen.getByLabelText('Name')).toBeInTheDocument());
    await addLearner('Maya', '1');
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });
});
