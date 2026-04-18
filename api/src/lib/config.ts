/**
 * Centralised configuration loader.
 * Reads server-side environment variables (no VITE_ prefix). Throws clear errors
 * when a feature endpoint is hit without its dependencies configured.
 */

function envVal(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== '' ? v.trim() : undefined;
}

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
  },
  auth: {
    msTenantId: envVal('AZURE_AD_TENANT_ID') ?? 'common',
    googleClientId: envVal('GOOGLE_CLIENT_ID'),
  },
  cosmos: {
    endpoint: envVal('COSMOS_ENDPOINT')?.replace(/\/$/, ''),
    key: envVal('COSMOS_KEY'),
    database: envVal('COSMOS_DATABASE') ?? 'wizbit',
  },
  policy: {
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
