import { app } from '@azure/functions';
import { ok } from '../lib/http.js';

app.http('health', {
  route: 'health',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async () => ok({ status: 'ok', time: new Date().toISOString() }),
});
