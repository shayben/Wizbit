import { describe, it, expect, beforeEach } from 'vitest';
import {
  collectSticker,
  loadCollectedStickers,
  getStickerCount,
} from '../services/stickerAlbumService';

const STORAGE_KEY = 'wizbit:sticker-album';

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY);
});

describe('collectSticker', () => {
  it('adds a new sticker to the album', () => {
    const sticker = collectSticker({
      label: 'Brave Knight',
      stickerUrl: 'https://img.com/knight.png',
      stickerSource: 'generated',
      caption: 'Knights wear shiny armor!',
    });

    expect(sticker.id).toMatch(/^sticker_/);
    expect(sticker.label).toBe('Brave Knight');
    expect(sticker.collectedAt).toBeTruthy();
    expect(getStickerCount()).toBe(1);
  });

  it('deduplicates by normalized label', () => {
    collectSticker({
      label: 'Brave Knight',
      stickerEmoji: '⚔️',
      stickerSource: 'emoji',
      caption: 'Knights are brave!',
    });
    collectSticker({
      label: '  brave knight  ',
      stickerEmoji: '⚔️',
      stickerSource: 'emoji',
      caption: 'Knights are brave!',
    });

    expect(getStickerCount()).toBe(1);
  });

  it('upgrades emoji-only sticker to image when re-collected', () => {
    collectSticker({
      label: 'Dragon',
      stickerEmoji: '🐉',
      stickerSource: 'emoji',
      caption: 'Dragons breathe fire!',
    });

    const upgraded = collectSticker({
      label: 'Dragon',
      stickerUrl: 'https://img.com/dragon.png',
      stickerSource: 'generated',
      caption: 'Dragons breathe fire!',
    });

    expect(getStickerCount()).toBe(1);
    expect(upgraded.stickerUrl).toBe('https://img.com/dragon.png');
    expect(upgraded.stickerSource).toBe('generated');
  });

  it('does not downgrade image to emoji', () => {
    collectSticker({
      label: 'Cat',
      stickerUrl: 'https://img.com/cat.png',
      stickerSource: 'wikipedia',
      caption: 'Cats are cute!',
    });

    const result = collectSticker({
      label: 'Cat',
      stickerEmoji: '🐱',
      stickerSource: 'emoji',
      caption: 'Cats are cute!',
    });

    expect(result.stickerUrl).toBe('https://img.com/cat.png');
    expect(result.stickerSource).toBe('wikipedia');
  });

  it('stores story title metadata', () => {
    const sticker = collectSticker({
      label: 'Wizard',
      stickerEmoji: '🧙',
      stickerSource: 'emoji',
      caption: 'Wizards cast spells!',
      storyTitle: 'The Magic Forest',
    });

    expect(sticker.storyTitle).toBe('The Magic Forest');
  });
});

describe('loadCollectedStickers', () => {
  it('returns empty array when no stickers', async () => {
    expect(await loadCollectedStickers()).toEqual([]);
  });

  it('returns stickers sorted newest first', async () => {
    // Insert two stickers with controlled timestamps
    const raw = [
      { id: 's1', label: 'Old', stickerEmoji: '🧓', stickerSource: 'emoji', caption: 'old', collectedAt: '2024-01-01T00:00:00Z' },
      { id: 's2', label: 'New', stickerEmoji: '👶', stickerSource: 'emoji', caption: 'new', collectedAt: '2024-06-01T00:00:00Z' },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));

    const loaded = await loadCollectedStickers();
    expect(loaded[0].label).toBe('New');
    expect(loaded[1].label).toBe('Old');
  });

  it('handles corrupted localStorage gracefully', async () => {
    localStorage.setItem(STORAGE_KEY, 'not json');
    expect(await loadCollectedStickers()).toEqual([]);
  });
});

describe('getStickerCount', () => {
  it('returns 0 when empty', () => {
    expect(getStickerCount()).toBe(0);
  });

  it('returns correct count after adding stickers', () => {
    collectSticker({ label: 'A', stickerEmoji: '🅰️', stickerSource: 'emoji', caption: 'a' });
    collectSticker({ label: 'B', stickerEmoji: '🅱️', stickerSource: 'emoji', caption: 'b' });
    collectSticker({ label: 'C', stickerEmoji: '©️', stickerSource: 'emoji', caption: 'c' });
    expect(getStickerCount()).toBe(3);
  });
});
