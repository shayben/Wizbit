/**
 * Centralised configuration loader.
 * Reads server-side environment variables (no VITE_ prefix). Throws clear errors
 * when a feature endpoint is hit without its dependencies configured.
 */

function envVal(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== '' ? v.trim() : undefined;
}

function envSet(name: string, normalize = false): Set<string> {
  const values = (envVal(name) ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => normalize ? value.toLowerCase() : value);
  return new Set(values);
}

const DEFAULT_ADMIN_EMAILS = [
  'shaybenelazar@hotmail.com',
  'shay.benel@gmail.com',
  'shbenela@microsoft.com',
];

const DEFAULT_ADMIN_UIDS = [
  'google:114788041842846489858',
];

export const config = {
  vision: {
    endpoint: envVal('AZURE_VISION_ENDPOINT')?.replace(/\/$/, ''),
    key: envVal('AZURE_VISION_KEY'),
  },
  speech: {
    key: envVal('AZURE_SPEECH_KEY'),
    region: envVal('AZURE_SPEECH_REGION'),
  },
  translator: {
    key: envVal('AZURE_TRANSLATOR_KEY'),
    region: envVal('AZURE_TRANSLATOR_REGION'),
  },
  openai: {
    endpoint: envVal('AZURE_OPENAI_ENDPOINT')?.replace(/\/$/, ''),
    key: envVal('AZURE_OPENAI_KEY'),
    deployment: envVal('AZURE_OPENAI_DEPLOYMENT') ?? 'gpt-4o-mini',
    dalleDeployment: envVal('AZURE_DALLE_DEPLOYMENT'),
    whisperDeployment: envVal('AZURE_OPENAI_WHISPER_DEPLOYMENT') ?? 'whisper',
    /** Optional separate endpoint/key for the Whisper deployment when it lives
     *  in a different AOAI resource (Whisper is region-limited and may not be
     *  available in the same region as the chat deployment). Falls back to
     *  the main `endpoint` / `key` when unset. */
    whisperEndpoint: envVal('AZURE_OPENAI_WHISPER_ENDPOINT')?.replace(/\/$/, ''),
    whisperKey: envVal('AZURE_OPENAI_WHISPER_KEY'),
  },
  auth: {
    msTenantId: envVal('AZURE_AD_TENANT_ID') ?? 'common',
    googleClientId: envVal('GOOGLE_CLIENT_ID'),
    adminUids: new Set([...DEFAULT_ADMIN_UIDS, ...envSet('ADMIN_UIDS')]),
    adminEmails: new Set([...DEFAULT_ADMIN_EMAILS, ...envSet('ADMIN_EMAILS', true)]),
  },
  cosmos: {
    endpoint: envVal('COSMOS_ENDPOINT')?.replace(/\/$/, ''),
    key: envVal('COSMOS_KEY'),
    database: envVal('COSMOS_DATABASE') ?? 'wizbit',
    progressContainer: envVal('COSMOS_PROGRESS_CONTAINER') ?? 'progress',
  },
  policy: {
    freemiumEnabled: (envVal('FREEMIUM_ENABLED') ?? 'false').toLowerCase() === 'true',
    allowAnonymous: (envVal('ALLOW_ANONYMOUS') ?? 'true').toLowerCase() !== 'false',
    anonymousMultiplier: Number(envVal('ANONYMOUS_DAILY_LIMIT_MULTIPLIER') ?? '0.5') || 0.5,
  },
};

export function requireConfig(value: string | undefined, name: string): string {
  if (!value) {
    throw new ConfigError(`Server is missing required configuration: ${name}`);
  }
  return value;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}
