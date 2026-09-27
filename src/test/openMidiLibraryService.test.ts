import { describe, expect, it } from 'vitest';
import { mapCommonsMidiResults } from '../services/openMidiLibraryService';

describe('openMidiLibraryService', () => {
  it('maps public-domain Wikimedia MIDI files', () => {
    const results = mapCommonsMidiResults({
      query: {
        pages: [{
          pageid: 42,
          title: 'File:Für Elise.mid',
          imageinfo: [{
            size: 4096,
            duration: 120,
            mime: 'audio/midi',
            url: 'https://upload.wikimedia.org/fur-elise.mid',
            descriptionurl: 'https://commons.wikimedia.org/wiki/File:Für_Elise.mid',
            extmetadata: {
              ObjectName: { value: 'Für Elise' },
              Artist: { value: '<b>Ludwig van Beethoven</b>' },
              LicenseShortName: { value: 'Public domain' },
              AttributionRequired: { value: 'false' },
            },
          }],
        }],
      },
    });

    expect(results).toEqual([expect.objectContaining({
      pageId: 42,
      title: 'Für Elise',
      artist: 'Ludwig van Beethoven',
      license: 'Public domain',
      fileName: 'Für Elise.mid',
    })]);
  });

  it('excludes files that require attribution or are not MIDI', () => {
    expect(mapCommonsMidiResults({
      query: {
        pages: [
          {
            pageid: 1,
            title: 'File:Licensed.mid',
            imageinfo: [{
              mime: 'audio/midi',
              url: 'https://example.com/licensed.mid',
              descriptionurl: 'https://example.com/source',
              extmetadata: {
                LicenseShortName: { value: 'CC BY-SA 4.0' },
                AttributionRequired: { value: 'true' },
              },
            }],
          },
          {
            pageid: 2,
            title: 'File:Audio.ogg',
            imageinfo: [{
              mime: 'audio/ogg',
              url: 'https://example.com/audio.ogg',
              descriptionurl: 'https://example.com/source',
              extmetadata: {
                LicenseShortName: { value: 'Public domain' },
                AttributionRequired: { value: 'false' },
              },
            }],
          },
        ],
      },
    })).toEqual([]);
  });
});
