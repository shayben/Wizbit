import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiPost = vi.hoisted(() => vi.fn());

vi.mock('../services/apiClient', () => ({ apiPost }));

import {
  deleteDocument,
  queryDocuments,
  readDocument,
  upsertDocument,
} from '../services/cosmosService';

beforeEach(() => apiPost.mockReset());

describe('learner data client', () => {
  it('sends writes through the authenticated backend', async () => {
    apiPost.mockResolvedValue({ ok: true });
    const document = { id: 'doc-1', uid: 'acct::kid', type: 'progress' };
    await upsertDocument(document);
    expect(apiPost).toHaveBeenCalledWith('/learner-data', {
      operation: 'upsert',
      uid: 'acct::kid',
      document,
    });
  });

  it('returns server documents from reads and queries', async () => {
    apiPost
      .mockResolvedValueOnce({ document: { id: 'doc-1' } })
      .mockResolvedValueOnce({ documents: [{ id: 'doc-2' }] });
    await expect(readDocument('doc-1', 'acct')).resolves.toEqual({ id: 'doc-1' });
    await expect(queryDocuments('SELECT * FROM c WHERE c.uid = @uid', [], 'acct'))
      .resolves.toEqual([{ id: 'doc-2' }]);
  });

  it('sends deletes through the backend', async () => {
    apiPost.mockResolvedValue({ ok: true });
    await deleteDocument('doc-1', 'acct');
    expect(apiPost).toHaveBeenCalledWith('/learner-data', {
      operation: 'delete',
      uid: 'acct',
      id: 'doc-1',
    });
  });
});
