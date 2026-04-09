/**
 * Azure Cosmos DB REST API client.
 *
 * Uses the browser's Web Crypto API to generate HMAC-SHA256 authorization
 * headers — no server-side code or SDK required.
 *
 * Required env vars:
 *   VITE_COSMOS_ENDPOINT  — e.g. https://<account>.documents.azure.com
 *   VITE_COSMOS_KEY       — Primary or secondary master key (base64)
 *   VITE_COSMOS_DATABASE  — Database name (default: wizbit)
 *   VITE_COSMOS_CONTAINER — Container name (default: progress)
 *
 * Container setup:
 *   Partition key: /uid
 *   Index policy: include /uid, /type, /date, /failCount paths.
 */

const ENDPOINT   = (import.meta.env.VITE_COSMOS_ENDPOINT as string | undefined)?.replace(/\/$/, '');
const KEY_B64    = import.meta.env.VITE_COSMOS_KEY as string | undefined;
const DATABASE   = (import.meta.env.VITE_COSMOS_DATABASE as string | undefined) ?? 'wizbit';
const CONTAINER  = (import.meta.env.VITE_COSMOS_CONTAINER as string | undefined) ?? 'progress';

export const isCosmosConfigured = Boolean(ENDPOINT && KEY_B64);

// ---------------------------------------------------------------------------
// HMAC-SHA256 auth header
// ---------------------------------------------------------------------------

async function getAuthHeader(
  verb: string,
  resourceType: string,
  resourceId: string,
  utcDate: string,
): Promise<string> {
  if (!KEY_B64) throw new Error('Cosmos DB key not configured');

  const payload =
    `${verb.toLowerCase()}\n${resourceType.toLowerCase()}\n${resourceId}\n${utcDate.toLowerCase()}\n\n`;

  const keyBytes = Uint8Array.from(atob(KEY_B64), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sigBytes = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(payload));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));

  return encodeURIComponent(`type=master&ver=1.0&sig=${sigB64}`);
}

// ---------------------------------------------------------------------------
// Low-level fetch helpers
// ---------------------------------------------------------------------------

function utcNow(): string {
  return new Date().toUTCString();
}

const COLL_RESOURCE_ID = `dbs/${DATABASE}/colls/${CONTAINER}`;
const DOCS_URL = `${ENDPOINT}/${COLL_RESOURCE_ID}/docs`;

interface CosmosHeaders {
  Authorization: string;
  'x-ms-date': string;
  'x-ms-version': string;
  'Content-Type': string;
  Accept: string;
}

async function buildHeaders(
  verb: string,
  resourceType: string,
  resourceId: string,
  extraHeaders?: Record<string, string>,
): Promise<CosmosHeaders & Record<string, string>> {
  const date = utcNow();
  const auth = await getAuthHeader(verb, resourceType, resourceId, date);
  return {
    Authorization: auth,
    'x-ms-date': date,
    'x-ms-version': '2023-11-15',
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...extraHeaders,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Upsert (create or replace) a document. */
export async function upsertDocument(doc: Record<string, unknown>): Promise<void> {
  const headers = await buildHeaders('post', 'docs', COLL_RESOURCE_ID, {
    'x-ms-documentdb-is-upsert': 'true',
  });
  const res = await fetch(DOCS_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(doc),
  });
  if (!res.ok) throw new Error(`Cosmos upsert failed: ${res.status} ${res.statusText}`);
}

/** Read a single document by id (partition key = uid). */
export async function readDocument<T>(id: string, uid: string): Promise<T | null> {
  const resourceId = `${COLL_RESOURCE_ID}/docs/${id}`;
  const headers = await buildHeaders('get', 'docs', resourceId, {
    'x-ms-documentdb-partitionkey': JSON.stringify([uid]),
  });
  const res = await fetch(`${ENDPOINT}/${resourceId}`, { method: 'GET', headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Cosmos read failed: ${res.status}`);
  return res.json() as Promise<T>;
}

/** Delete a document by id. Silently ignores 404. */
export async function deleteDocument(id: string, uid: string): Promise<void> {
  const resourceId = `${COLL_RESOURCE_ID}/docs/${id}`;
  const headers = await buildHeaders('delete', 'docs', resourceId, {
    'x-ms-documentdb-partitionkey': JSON.stringify([uid]),
  });
  const res = await fetch(`${ENDPOINT}/${resourceId}`, { method: 'DELETE', headers });
  if (res.status === 404) return;
  if (!res.ok) throw new Error(`Cosmos delete failed: ${res.status}`);
}

export interface QueryResult<T> {
  Documents: T[];
  _count: number;
}

/**
 * Execute a parameterised SQL query scoped to a single partition (uid).
 * Uses cross-partition=false since all queries are partition-scoped.
 */
export async function queryDocuments<T>(
  sql: string,
  parameters: Array<{ name: string; value: unknown }>,
  uid: string,
): Promise<T[]> {
  const headers = await buildHeaders('post', 'docs', COLL_RESOURCE_ID, {
    'Content-Type': 'application/query+json',
    'x-ms-documentdb-isquery': 'true',
    'x-ms-documentdb-query-enablecrosspartition': 'false',
    'x-ms-documentdb-partitionkey': JSON.stringify([uid]),
    'x-ms-max-item-count': '200',
  });
  const body = JSON.stringify({ query: sql, parameters });
  const res = await fetch(DOCS_URL, { method: 'POST', headers, body });
  if (!res.ok) throw new Error(`Cosmos query failed: ${res.status}`);
  const data = (await res.json()) as QueryResult<T>;
  return data.Documents ?? [];
}
