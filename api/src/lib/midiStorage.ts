import { BlobServiceClient, type ContainerClient } from '@azure/storage-blob';

const DEFAULT_CONTAINER = 'midi-library';
let containerPromise: Promise<ContainerClient | null> | null = null;

async function initializeContainer(): Promise<ContainerClient | null> {
  const connectionString = process.env.MIDI_STORAGE_CONNECTION_STRING
    || process.env.AzureWebJobsStorage
    || '';
  if (!connectionString) return null;

  const service = BlobServiceClient.fromConnectionString(connectionString);
  const container = service.getContainerClient(
    process.env.MIDI_STORAGE_CONTAINER || DEFAULT_CONTAINER,
  );
  await container.createIfNotExists();
  return container;
}

export function getMidiContainer(): Promise<ContainerClient | null> {
  if (!containerPromise) {
    containerPromise = initializeContainer().catch((error) => {
      console.error('MIDI storage initialization failed', error);
      return null;
    });
  }
  return containerPromise;
}

export function midiBlobPrefix(uid: string): string {
  return `${Buffer.from(uid, 'utf8').toString('base64url')}/`;
}

export function midiBlobName(uid: string, id: string): string {
  return `${midiBlobPrefix(uid)}${id}.mid`;
}

export function encodeMidiMetadata(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64');
}

export function decodeMidiMetadata(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  try {
    return Buffer.from(value, 'base64').toString('utf8');
  } catch {
    return fallback;
  }
}

export function isValidMidiId(id: string): boolean {
  return /^midi_[a-f0-9]{64}$/.test(id);
}

export function hasMidiHeader(bytes: Uint8Array): boolean {
  return bytes.length >= 4
    && bytes[0] === 0x4d
    && bytes[1] === 0x54
    && bytes[2] === 0x68
    && bytes[3] === 0x64;
}

export function _resetMidiStorageForTests(): void {
  containerPromise = null;
}
