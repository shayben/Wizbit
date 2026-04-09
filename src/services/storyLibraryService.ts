/**
 * Story library service — persists adventure stories in localStorage.
 * Stories are saved incrementally (after each chapter) and can be
 * resumed later if not yet completed.
 */

import type { StoryContext } from './storyService';

const STORAGE_KEY = 'wizbit:story-library';

export interface SavedChapter {
  number: number;
  title: string;
  text: string;
  choiceMade: string;
}

export interface SavedStory {
  id: string;
  prompt: string;
  readingLevel: string;
  levelEmoji: string;
  chapters: SavedChapter[];
  /** Generation context needed to resume the story. */
  storyContext: StoryContext;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

function loadAll(): SavedStory[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedStory[];
    // Migrate old stories that lack new fields
    return parsed.map((s) => ({
      ...s,
      completed: s.completed ?? true,
      storyContext: s.storyContext ?? { prompt: s.prompt, readingLevel: s.readingLevel, chapters: [] },
      updatedAt: s.updatedAt ?? s.createdAt,
    }));
  } catch {
    return [];
  }
}

function saveAll(stories: SavedStory[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stories));
  } catch { /* quota exceeded — silently fail */ }
}

/** Return all saved stories, most recent first. */
export function getStories(): SavedStory[] {
  return loadAll().sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

/** Create a new story entry. Returns the saved story with its generated ID. */
export function createStory(story: Omit<SavedStory, 'id' | 'createdAt' | 'updatedAt'>): SavedStory {
  const now = new Date().toISOString();
  const saved: SavedStory = {
    ...story,
    id: `story_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    updatedAt: now,
  };
  const all = loadAll();
  all.push(saved);
  saveAll(all);
  return saved;
}

/** Update an existing story by ID. Only provided fields are merged. */
export function updateStory(id: string, updates: Partial<Pick<SavedStory, 'chapters' | 'storyContext' | 'completed'>>): void {
  const all = loadAll();
  const idx = all.findIndex((s) => s.id === id);
  if (idx === -1) return;
  all[idx] = { ...all[idx], ...updates, updatedAt: new Date().toISOString() };
  saveAll(all);
}

/** Get a single story by ID. */
export function getStory(id: string): SavedStory | undefined {
  return loadAll().find((s) => s.id === id);
}

/** Delete a story by id. */
export function deleteStory(id: string): void {
  const all = loadAll().filter((s) => s.id !== id);
  saveAll(all);
}

// Keep old name as alias for backward compat during migration
export const saveStory = createStory;

// ---------------------------------------------------------------------------
// Story stats for trophy evaluation
// ---------------------------------------------------------------------------

export interface StoryStats {
  /** Total stories created (in-progress + completed). */
  storiesCreated: number;
  /** Total stories that reached their ending. */
  storiesCompleted: number;
  /** Unique reading level grades used across all stories. */
  readingLevelsUsed: string[];
  /** Chapter count of the longest completed story. */
  longestAdventure: number;
}

export function getStoryStats(): StoryStats {
  const all = loadAll();
  const completed = all.filter((s) => s.completed);
  const levelsUsed = [...new Set(all.map((s) => s.readingLevel))];
  const longestAdventure = completed.reduce(
    (max, s) => Math.max(max, s.chapters.length),
    0,
  );
  return {
    storiesCreated: all.length,
    storiesCompleted: completed.length,
    readingLevelsUsed: levelsUsed,
    longestAdventure,
  };
}
