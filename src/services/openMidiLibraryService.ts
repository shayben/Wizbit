import { MAX_MIDI_FILE_BYTES } from './midiLibraryService';

const COMMONS_API_URL = 'https://commons.wikimedia.org/w/api.php';

interface CommonsMetadataValue {
  value?: string;
}

interface CommonsImageInfo {
  size?: number;
  duration?: number;
  url?: string;
  descriptionurl?: string;
  mime?: string;
  extmetadata?: {
    ObjectName?: CommonsMetadataValue;
    Artist?: CommonsMetadataValue;
    LicenseShortName?: CommonsMetadataValue;
    LicenseUrl?: CommonsMetadataValue;
    AttributionRequired?: CommonsMetadataValue;
  };
}

interface CommonsPage {
  pageid?: number;
  title?: string;
  imageinfo?: CommonsImageInfo[];
}

interface CommonsSearchResponse {
  query?: {
    pages?: CommonsPage[];
  };
}

export interface OpenMidiResult {
  pageId: number;
  title: string;
  fileName: string;
  downloadUrl: string;
  descriptionUrl: string;
  size: number;
  duration: number | null;
  artist: string;
  license: string;
  licenseUrl: string | null;
}

function metadataText(value?: string) {
  if (!value) return '';
  const parsed = new DOMParser().parseFromString(value, 'text/html');
  return parsed.body.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function isAttributionFree(info: CommonsImageInfo) {
  const license = metadataText(info.extmetadata?.LicenseShortName?.value).toLowerCase();
  const attributionRequired = info.extmetadata?.AttributionRequired?.value?.toLowerCase() === 'true';
  return !attributionRequired
    && (license.includes('public domain') || license === 'cc0');
}

export function mapCommonsMidiResults(value: unknown): OpenMidiResult[] {
  const response = value as CommonsSearchResponse;
  if (!Array.isArray(response?.query?.pages)) return [];

  return response.query.pages.flatMap((page): OpenMidiResult[] => {
    const info = page.imageinfo?.[0];
    if (
      !Number.isInteger(page.pageid)
      || typeof page.title !== 'string'
      || info?.mime !== 'audio/midi'
      || typeof info.url !== 'string'
      || typeof info.descriptionurl !== 'string'
      || !isAttributionFree(info)
    ) {
      return [];
    }

    const fallbackName = page.title.replace(/^File:/i, '');
    const title = metadataText(info.extmetadata?.ObjectName?.value)
      || fallbackName.replace(/\.midi?$/i, '');
    const licenseUrl = info.extmetadata?.LicenseUrl?.value;

    return [{
      pageId: page.pageid!,
      title,
      fileName: fallbackName,
      downloadUrl: info.url,
      descriptionUrl: info.descriptionurl,
      size: typeof info.size === 'number' ? info.size : 0,
      duration: typeof info.duration === 'number' ? info.duration : null,
      artist: metadataText(info.extmetadata?.Artist?.value) || 'Wikimedia Commons contributor',
      license: metadataText(info.extmetadata?.LicenseShortName?.value) || 'Public domain',
      licenseUrl: typeof licenseUrl === 'string' ? licenseUrl : null,
    }];
  });
}

export async function searchOpenMidiLibrary(query: string): Promise<OpenMidiResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const url = new URL(COMMONS_API_URL);
  url.searchParams.set('action', 'query');
  url.searchParams.set('generator', 'search');
  url.searchParams.set('gsrsearch', `${trimmed} filemime:audio/midi`);
  url.searchParams.set('gsrnamespace', '6');
  url.searchParams.set('gsrlimit', '20');
  url.searchParams.set('prop', 'imageinfo');
  url.searchParams.set('iiprop', 'url|size|mime|extmetadata');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('origin', '*');

  const response = await fetch(url);
  if (!response.ok) throw new Error('Open MIDI search is unavailable.');
  return mapCommonsMidiResults(await response.json()).slice(0, 12);
}

export async function downloadOpenMidi(result: OpenMidiResult): Promise<File> {
  if (result.size > MAX_MIDI_FILE_BYTES) {
    throw new Error('This MIDI is larger than the 5 MB library limit.');
  }

  const response = await fetch(result.downloadUrl);
  if (!response.ok) throw new Error('Could not download this MIDI file.');
  const blob = await response.blob();
  if (blob.size > MAX_MIDI_FILE_BYTES) {
    throw new Error('This MIDI is larger than the 5 MB library limit.');
  }

  return new File([blob], result.fileName, {
    type: 'audio/midi',
    lastModified: Date.now(),
  });
}
