/**
 * Authenticated proxy for learner profiles and progress.
 *
 * The browser supplies a learner scope (`accountUid` or
 * `accountUid::profileId`). The verified account must own that scope, and all
 * Cosmos operations remain inside its partition.
 */

import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import type { SqlParameter } from '@azure/cosmos';
import { resolveCaller, type Caller } from '../lib/auth.js';
import { getCosmosContainers } from '../lib/cosmos.js';
import { badRequest, json, ok, serverError, unauthorized } from '../lib/http.js';

type LearnerDataRequest =
  | { operation: 'upsert'; uid: string; document: Record<string, unknown> }
  | { operation: 'read'; uid: string; id: string }
  | { operation: 'delete'; uid: string; id: string }
  | { operation: 'query'; uid: string; sql: string; parameters?: SqlParameter[] };

export function isOwnedLearnerScope(caller: Caller, uid: string): boolean {
  return caller.provider !== 'anonymous'
    && (uid === caller.uid || uid.startsWith(`${caller.uid}::`));
}

function isValidText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maxLength
    && !/[\u0000-\u001f]/.test(value);
}

export async function learnerDataHandler(
  request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  let body: LearnerDataRequest;
  try {
    body = (await request.json()) as LearnerDataRequest;
  } catch {
    return badRequest('Invalid JSON body');
  }

  if (!body || !isValidText(body.uid, 256)) {
    return badRequest('Invalid learner scope');
  }

  const caller = await resolveCaller({
    authHeader: request.headers.get('authorization'),
    providerHeader: request.headers.get('x-auth-provider'),
    ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
  });
  if (!isOwnedLearnerScope(caller, body.uid)) {
    return unauthorized();
  }

  const containers = await getCosmosContainers();
  if (!containers) {
    return json(503, { error: 'unavailable', message: 'Learner sync is not configured' });
  }

  try {
    switch (body.operation) {
      case 'upsert': {
        if (!body.document || !isValidText(body.document.id, 512)) {
          return badRequest('Invalid document');
        }
        const document = { ...body.document, uid: body.uid };
        await containers.progress.items.upsert(document);
        return ok({ ok: true });
      }
      case 'read': {
        if (!isValidText(body.id, 512)) return badRequest('Invalid document id');
        const { resource } = await containers.progress.item(body.id, body.uid).read();
        return ok({ document: resource ?? null });
      }
      case 'delete': {
        if (!isValidText(body.id, 512)) return badRequest('Invalid document id');
        await containers.progress.item(body.id, body.uid).delete();
        return ok({ ok: true });
      }
      case 'query': {
        if (
          !isValidText(body.sql, 4_000)
          || !/^\s*select\b/i.test(body.sql)
          || /;\s*\S/.test(body.sql)
        ) {
          return badRequest('Invalid query');
        }
        const parameters = (body.parameters ?? [])
          .filter((parameter) => parameter.name !== '@uid')
          .slice(0, 20);
        parameters.push({ name: '@uid', value: body.uid });
        const { resources } = await containers.progress.items.query(
          { query: body.sql, parameters },
          { partitionKey: body.uid, maxItemCount: 500 },
        ).fetchAll();
        return ok({ documents: resources });
      }
      default:
        return badRequest('Invalid operation');
    }
  } catch (error) {
    const statusCode = (error as { code?: number }).code;
    if (body.operation === 'read' && statusCode === 404) {
      return ok({ document: null });
    }
    if (body.operation === 'delete' && statusCode === 404) {
      return ok({ ok: true });
    }
    console.error('learner data operation failed', { operation: body.operation, caller: caller.shortId });
    return serverError('Learner data operation failed');
  }
}

app.http('learnerData', {
  route: 'learner-data',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: learnerDataHandler,
});
