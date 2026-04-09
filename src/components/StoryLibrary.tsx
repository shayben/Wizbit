/**
 * Story Library — browse saved stories, re-read chapters, or continue in-progress adventures.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { loadStories, deleteStory } from '../services/storyLibraryService';
import type { SavedStory } from '../services/storyLibraryService';
import ReadingSession from './ReadingSession';
import { deserializeRegistry } from '../services/stickerService';
import { useAuth } from '../contexts/AuthContext';

interface StoryLibraryProps {
  onClose: () => void;
  /** Called when the user wants to continue an in-progress story. */
  onContinue?: (story: SavedStory) => void;
}

const StoryLibrary: React.FC<StoryLibraryProps> = ({ onClose, onContinue }) => {
  const { user } = useAuth();
  const [stories, setStories] = useState<SavedStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [readingChapter, setReadingChapter] = useState<{ story: SavedStory; chapterIdx: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadStories(user?.uid)
      .then((s) => { if (!cancelled) setStories(s); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user?.uid]);

  const handleDelete = useCallback((id: string) => {
    deleteStory(id, user?.uid);
    setStories((prev) => prev.filter((s) => s.id !== id));
  }, [user?.uid]);

  // Restore sticker registry from the selected story for visual consistency
  const readingStoryRegistry = useMemo(
    () => readingChapter?.story.stickerRegistry
      ? deserializeRegistry(readingChapter.story.stickerRegistry)
      : undefined,
    [readingChapter],
  );
  const readingStoryLabels = useMemo(
    () => readingStoryRegistry ? Array.from(readingStoryRegistry.keys()) : undefined,
    [readingStoryRegistry],
  );

  // ── Reading a chapter ──
  if (readingChapter) {
    const { story, chapterIdx } = readingChapter;
    const chapter = story.chapters[chapterIdx];
    const isLast = chapterIdx === story.chapters.length - 1;
    return (
      <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white">
        {/* Chapter header */}
        <div className="text-center pt-4 md:pt-6 pb-2 px-4">
          <span className="inline-block bg-purple-100 text-purple-700 text-xs md:text-sm font-bold px-3 py-1 rounded-full mb-1">
            Chapter {chapter.number}{isLast ? ' — Final' : ''}
          </span>
          <h2 className="text-lg md:text-xl font-bold text-purple-700">{chapter.title}</h2>
        </div>

        <main className="pb-24 pt-0">
          <ReadingSession
            text={chapter.text}
            stickerRegistry={readingStoryRegistry}
            knownStickerLabels={readingStoryLabels}
            storyTitle={chapter.title}
            onReset={() => setReadingChapter(null)}
          />
        </main>

        {/* Navigation buttons */}
        <div className="fixed bottom-0 inset-x-0 p-4 bg-gradient-to-t from-white via-white to-transparent z-20">
          <div className="flex gap-3 max-w-lg md:max-w-2xl mx-auto">
            {chapterIdx > 0 && (
              <button
                type="button"
                onClick={() => setReadingChapter({ story, chapterIdx: chapterIdx - 1 })}
                className="py-3 md:py-4 px-5 rounded-2xl bg-gray-100 text-gray-600 font-bold text-lg
                           active:bg-gray-200 transition-colors"
              >
                ← Prev
              </button>
            )}
            <button
              type="button"
              onClick={() => setReadingChapter(null)}
              className="flex-1 py-3 md:py-4 rounded-2xl bg-purple-100 text-purple-700 font-bold text-lg
                         active:bg-purple-200 transition-colors"
            >
              📚 Back to Library
            </button>
            {chapterIdx < story.chapters.length - 1 && (
              <button
                type="button"
                onClick={() => setReadingChapter({ story, chapterIdx: chapterIdx + 1 })}
                className="py-3 md:py-4 px-5 rounded-2xl bg-purple-600 text-white font-bold text-lg
                           active:bg-purple-700 transition-colors shadow-md"
              >
                Next →
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Library list ──
  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white p-6 md:p-10 pt-8">
      <div className="max-w-lg md:max-w-2xl mx-auto">
        <button
          type="button"
          onClick={onClose}
          className="text-purple-500 font-medium text-sm md:text-base mb-4"
        >
          ← Back
        </button>
        <h2 className="text-2xl md:text-3xl font-bold text-purple-700 mb-1">📚 My Stories</h2>
        {loading ? (
          <div className="flex items-center gap-2 text-purple-400 text-sm md:text-base mb-5">
            <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
            Loading stories…
          </div>
        ) : (
        <p className="text-gray-400 text-sm md:text-base mb-5">
          {stories.length === 0
            ? 'No saved stories yet. Start an adventure to see it here!'
            : `${stories.length} ${stories.length === 1 ? 'story' : 'stories'} saved`}
        </p>
        )}

        <div className="flex flex-col gap-4">
          {stories.map((story) => {
            const isExpanded = expandedId === story.id;
            const isInProgress = !story.completed;
            return (
              <div
                key={story.id}
                className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
                  isInProgress ? 'border-amber-200' : 'border-gray-100'
                }`}
              >
                {/* Story header — tap to expand */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : story.id)}
                  className="w-full text-left p-4 md:p-5 flex items-start gap-3 active:bg-gray-50 transition-colors"
                >
                  <span className="text-3xl md:text-4xl">{story.levelEmoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-800 text-base md:text-lg truncate">
                        {story.prompt}
                      </p>
                      {isInProgress && (
                        <span className="shrink-0 text-xs font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                          In Progress
                        </span>
                      )}
                    </div>
                    <p className="text-gray-400 text-xs md:text-sm mt-0.5">
                      {story.chapters.length} {story.chapters.length === 1 ? 'chapter' : 'chapters'} · Grade {story.readingLevel} · {formatDate(story.updatedAt ?? story.createdAt)}
                    </p>
                  </div>
                  <span className="text-gray-300 text-xl mt-1">{isExpanded ? '▾' : '▸'}</span>
                </button>

                {/* Expanded chapter list */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 md:px-5 pb-4 md:pb-5">
                    <div className="flex flex-col gap-2 mt-3">
                      {story.chapters.map((ch, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setReadingChapter({ story, chapterIdx: i })}
                          className="text-left bg-purple-50 rounded-xl p-3 md:p-4
                                     active:bg-purple-100 transition-colors"
                        >
                          <p className="font-semibold text-purple-700 text-sm md:text-base">
                            Chapter {ch.number}: {ch.title}
                          </p>
                          <p className="text-gray-500 text-xs md:text-sm line-clamp-1 mt-0.5">
                            {ch.text.slice(0, 100)}…
                          </p>
                        </button>
                      ))}
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2 mt-3">
                      {isInProgress && onContinue ? (
                        <button
                          type="button"
                          onClick={() => onContinue(story)}
                          className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white font-bold text-sm md:text-base
                                     active:bg-amber-600 transition-colors shadow-sm"
                        >
                          ▶️ Continue Adventure
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setReadingChapter({ story, chapterIdx: 0 })}
                          className="flex-1 py-2.5 rounded-xl bg-purple-600 text-white font-bold text-sm md:text-base
                                     active:bg-purple-700 transition-colors"
                        >
                          📖 Read from Start
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDelete(story.id)}
                        className="py-2.5 px-4 rounded-xl bg-red-50 text-red-500 font-bold text-sm md:text-base
                                   active:bg-red-100 transition-colors"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

export default StoryLibrary;
