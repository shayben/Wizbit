import { apiDelete, apiDownload, apiGet, apiUpload } from './apiClient';

export const MAX_MIDI_FILE_BYTES = 5 * 1024 * 1024;

export interface SavedMidiFile {
  id: string;
  title: string;
  fileName: string;
  size: number;
  uploadedAt: string;
  updatedAt: string;
}

function libraryPath(uid: string, id?: string) {
  const suffix = id ? `/${encodeURIComponent(id)}` : '';
  return `/midi-library${suffix}?uid=${encodeURIComponent(uid)}`;
}

async function midiContentId(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `midi_${hash}`;
}

export async function listMidiFiles(uid: string): Promise<SavedMidiFile[]> {
  const result = await apiGet<{ files: SavedMidiFile[] }>(libraryPath(uid));
  return result.files;
}

export async function saveMidiFile(uid: string, file: File, title: string): Promise<SavedMidiFile> {
  if (file.size > MAX_MIDI_FILE_BYTES) {
    throw new Error('MIDI files must be 5 MB or smaller.');
  }
  const id = await midiContentId(file);
  const result = await apiUpload<{ file: SavedMidiFile }>(
    libraryPath(uid, id),
    file,
    {
      'Content-Type': 'audio/midi',
      'X-Midi-Title': encodeURIComponent(title),
      'X-Midi-Filename': encodeURIComponent(file.name),
    },
  );
  return result.file;
}

export async function loadMidiFile(uid: string, saved: SavedMidiFile): Promise<File> {
  const blob = await apiDownload(libraryPath(uid, saved.id));
  return new File([blob], saved.fileName, {
    type: blob.type || 'audio/midi',
    lastModified: new Date(saved.updatedAt).getTime(),
  });
}

export async function deleteMidiFile(uid: string, id: string): Promise<void> {
  await apiDelete(libraryPath(uid, id));
}
