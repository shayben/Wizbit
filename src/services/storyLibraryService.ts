/**
 * Story library service — persists completed adventure stories
 * in localStorage so users can revisit them.
 */

const STORAGE_KEY = 'reading-assistant:story-library';

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
  createdAt: string;
}

function loadAll(): SavedStory[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
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
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/** Save a completed story. */
export function saveStory(story: Omit<SavedStory, 'id' | 'createdAt'>): SavedStory {
  const saved: SavedStory = {
    ...story,
    id: `story_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  const all = loadAll();
  all.push(saved);
  saveAll(all);
  return saved;
}

/** Delete a story by id. */
export function deleteStory(id: string): void {
  const all = loadAll().filter((s) => s.id !== id);
  saveAll(all);
}
