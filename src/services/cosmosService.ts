/**
 * Authenticated learner-data client.
 *
 * The backend owns the Cosmos DB credentials and verifies that every requested
 * learner scope belongs to the signed-in account. localStorage remains only as
 * an offline cache in the calling services.
 */

import { apiPost } from './apiClient';

export const isCosmosConfigured = true;

export async function upsertDocument(doc: Record<string, unknown>): Promise<void> {
  const uid = typeof doc.uid === 'string' ? doc.uid : '';
  await apiPost('/learner-data', { operation: 'upsert', uid, document: doc });
}

export async function readDocument<T>(id: string, uid: string): Promise<T | null> {
  const result = await apiPost<
    { operation: 'read'; uid: string; id: string },
    { document: T | null }
  >('/learner-data', { operation: 'read', uid, id });
  return result.document;
}

export async function deleteDocument(id: string, uid: string): Promise<void> {
  await apiPost('/learner-data', { operation: 'delete', uid, id });
}

export async function queryDocuments<T>(
  sql: string,
  parameters: Array<{ name: string; value: unknown }>,
  uid: string,
): Promise<T[]> {
  const result = await apiPost<
    {
      operation: 'query';
      uid: string;
      sql: string;
      parameters: Array<{ name: string; value: unknown }>;
    },
    { documents: T[] }
  >('/learner-data', { operation: 'query', uid, sql, parameters });
  return result.documents;
}
