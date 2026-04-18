/**
 * Cosmos DB client lazily initialised on first use.
 *
 * Uses two containers:
 *   - `usage` (partition key /uid)  : per-user-per-day call counters
 *   - `users` (partition key /uid)  : plan / entitlement
 *
 * Containers are auto-created on first access (idempotent), so a fresh
 * Cosmos account can be wired in without manual provisioning steps.
 *
 * When Cosmos is not configured, the module exposes an in-memory fallback
 * so local dev and tests still work end-to-end.
 */

import { CosmosClient, type Container, type Database } from '@azure/cosmos';
import { config } from './config.js';

interface DbHandles {
  usage: Container;
  users: Container;
  waitlist: Container;
}

let handlesPromise: Promise<DbHandles | null> | null = null;

async function init(): Promise<DbHandles | null> {
  if (!config.cosmos.endpoint || !config.cosmos.key) {
    return null;
  }
  const client = new CosmosClient({
    endpoint: config.cosmos.endpoint,
    key: config.cosmos.key,
  });
  const { database }: { database: Database } = await client.databases.createIfNotExists({
    id: config.cosmos.database,
  });
  const { container: usage } = await database.containers.createIfNotExists({
    id: 'usage',
    partitionKey: { paths: ['/uid'] },
    defaultTtl: 60 * 60 * 24 * 90, // auto-purge after 90 days
  });
  const { container: users } = await database.containers.createIfNotExists({
    id: 'users',
    partitionKey: { paths: ['/uid'] },
  });
  const { container: waitlist } = await database.containers.createIfNotExists({
    id: 'waitlist',
    partitionKey: { paths: ['/uid'] },
  });
  return { usage, users, waitlist };
}

export function getCosmos(): Promise<DbHandles | null> {
  if (!handlesPromise) handlesPromise = init().catch(() => null);
  return handlesPromise;
}

/** Alias used by feature handlers that only need the container handles. */
export const getCosmosContainers = getCosmos;

/** Test helper — resets the lazy handle. */
export function _resetCosmosForTests(): void {
  handlesPromise = null;
}
