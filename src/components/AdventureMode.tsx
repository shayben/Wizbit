import React, { useState, useCallback, useEffect } from 'react';
import StoryPromptScreen from './StoryPromptScreen';
import ChapterChoices from './ChapterChoices';
import ReadingSession from './ReadingSession';
import { generateChapter } from '../services/storyService';
import type { StoryContext, ChapterResult } from '../services/storyService';
import { createStory, updateStory } from '../services/storyLibraryService';
import type { SavedStory } from '../services/storyLibraryService';
import {
  serializeRegistry,
  deserializeRegistry,
  type StickerRegistry,
} from '../services/stickerService';
import { useAuth } from '../contexts/AuthContext';

type AdventureStep = 'prompt' | 'generating' | 'reading' | 'choosing' | 'ending';

interface AdventureModeProps {
  readingLevel: string;
  levelEmoji: string;
  levelLabel: string;
  /** When provided, resume this in-progress story instead of showing the prompt screen. */
  resumeStory?: SavedStory;
  onReset: () => void;
}

const AdventureMode: React.FC<AdventureModeProps> = ({
  readingLevel,
  levelEmoji,
  levelLabel,
  resumeStory,
  onReset,
}) => {
  const { user } = useAuth();
  // If resuming, go straight to generating the next chapter
  const [step, setStep] = useState<AdventureStep>(resumeStory ? 'generating' : 'prompt');
  const [storyContext, setStoryContext] = useState<StoryContext>(
    resumeStory?.storyContext ?? { prompt: '', readingLevel, chapters: [] },
  );
  const [currentChapter, setCurrentChapter] = useState<ChapterResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneReading, setDoneReading] = useState(false);

  // Track the library entry ID so we can update it incrementally
  const savedStoryIdRef = React.useRef<string | null>(resumeStory?.id ?? null);
  const chaptersDetailRef = React.useRef<ChapterResult[]>([]);
  const resumeFiredRef = React.useRef(false);

  // Sticker registry for cross-chapter visual consistency
  const stickerRegistryRef = React.useRef<StickerRegistry>(
    resumeStory?.stickerRegistry
      ? deserializeRegistry(resumeStory.stickerRegistry)
      : new Map(),
  );

  /** Labels known from previous chapters (passed as AI context). */
  const knownStickerLabels = React.useMemo(
    () => Array.from(stickerRegistryRef.current.keys()),
    // Refresh whenever a new chapter is generated (chapters count changes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storyContext.chapters.length],
  );

  /** Persist the current state to the library (create or update). */
  const persistToLibrary = useCallback((
    ctx: StoryContext,
    details: ChapterResult[],
    completed: boolean,
  ) => {
    const chapters = details.map((ch, i) => ({
      number: ch.chapterNumber,
      title: ch.title,
      text: ch.text,
      choiceMade: ctx.chapters[i]?.choiceMade ?? (completed ? '(ending)' : ''),
    }));

    if (savedStoryIdRef.current) {
      updateStory(savedStoryIdRef.current, {
        chapters,
        storyContext: ctx,
        completed,
        stickerRegistry: serializeRegistry(stickerRegistryRef.current),
      }, user?.uid);
    } else {
      const saved = createStory({
        prompt: ctx.prompt,
        readingLevel,
        levelEmoji,
        chapters,
        storyContext: ctx,
        stickerRegistry: serializeRegistry(stickerRegistryRef.current),
        completed,
      }, user?.uid);
      savedStoryIdRef.current = saved.id;
    }
  }, [readingLevel, levelEmoji, user?.uid]);

  const generate = useCallback(async (ctx: StoryContext, choice?: string) => {
    setStep('generating');
    setError(null);
    setDoneReading(false);
    try {
      const chapter = await generateChapter(ctx, choice);
      setCurrentChapter(chapter);
      chaptersDetailRef.current = [...chaptersDetailRef.current, chapter];

      if (chapter.isEnding) {
        const finalCtx: StoryContext = {
          ...ctx,
          chapters: [...ctx.chapters, { summary: chapter.summary, choiceMade: '(ending)' }],
        };
        setStoryContext(finalCtx);
        persistToLibrary(finalCtx, [...chaptersDetailRef.current], true);
        setStep('ending');
      } else {
        // Save in-progress after each chapter
        persistToLibrary(ctx, [...chaptersDetailRef.current], false);
        setStep('reading');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate chapter');
      setStep(storyContext.chapters.length > 0 ? 'choosing' : 'prompt');
    }
  }, [persistToLibrary, storyContext.chapters.length]);

  // Resume a saved story — generate the next chapter on mount
  useEffect(() => {
    if (!resumeStory || resumeFiredRef.current) return;
    resumeFiredRef.current = true;
    const lastChoice = storyContext.chapters[storyContext.chapters.length - 1]?.choiceMade;
    generate(storyContext, lastChoice);
  });

  const handleStartStory = useCallback((prompt: string) => {
    const ctx: StoryContext = { prompt, readingLevel, chapters: [] };
    setStoryContext(ctx);
    chaptersDetailRef.current = [];
    savedStoryIdRef.current = null;
    stickerRegistryRef.current = new Map();
    generate(ctx);
  }, [readingLevel, generate]);

  const handleChoice = useCallback((choiceText: string) => {
    if (!currentChapter) return;
    const updatedCtx: StoryContext = {
      ...storyContext,
      chapters: [
        ...storyContext.chapters,
        { summary: currentChapter.summary, choiceMade: choiceText },
      ],
    };
    setStoryContext(updatedCtx);
    // Persist the choice before generating so progress isn't lost if generation fails
    persistToLibrary(updatedCtx, [...chaptersDetailRef.current], false);
    generate(updatedCtx, choiceText);
  }, [storyContext, currentChapter, generate, persistToLibrary]);

  const handleDoneReading = useCallback(() => {
    if (currentChapter?.isEnding) {
      setStep('ending');
    } else {
      setDoneReading(true);
      setStep('choosing');
    }
  }, [currentChapter]);

  // ── Prompt screen ──
  if (step === 'prompt') {
    return (
      <>
        {error && (
          <div className="fixed top-4 inset-x-4 z-50 bg-red-50 text-red-700 text-sm rounded-2xl p-3 text-center shadow-md">
            {error}
          </div>
        )}
        <StoryPromptScreen
          readingLevel={readingLevel}
          levelEmoji={levelEmoji}
          levelLabel={levelLabel}
          onStart={handleStartStory}
          onBack={onReset}
        />
      </>
    );
  }

  // ── Generating spinner ──
  if (step === 'generating') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white flex flex-col items-center justify-center gap-4">
        <div className="w-14 h-14 md:w-18 md:h-18 border-4 border-purple-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-purple-600 font-medium text-lg md:text-xl">
          ✨ Writing {currentChapter ? `Chapter ${storyContext.chapters.length + 1}` : 'your story'}…
        </p>
        <p className="text-purple-400 text-sm">This takes a few seconds</p>
      </div>
    );
  }

  // ── Reading the chapter ──
  if (step === 'reading' && currentChapter) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white">
        <div className="text-center pt-4 md:pt-6 pb-2 px-4">
          <span className="inline-block bg-purple-100 text-purple-700 text-xs md:text-sm font-bold px-3 py-1 rounded-full mb-1">
            Chapter {currentChapter.chapterNumber}
          </span>
          <h2 className="text-lg md:text-xl font-bold text-purple-700">{currentChapter.title}</h2>
        </div>

        <main className="pb-24 pt-0">
          <ReadingSession
            text={currentChapter.text}
            stickerRegistry={stickerRegistryRef.current}
            knownStickerLabels={knownStickerLabels}
            storyTitle={currentChapter.title}
            onReset={onReset}
          />
        </main>

        {!doneReading && (
          <div className="fixed bottom-0 inset-x-0 p-4 bg-gradient-to-t from-white via-white to-transparent z-20">
            <button
              type="button"
              onClick={handleDoneReading}
              className="w-full max-w-lg md:max-w-2xl mx-auto block py-4 md:py-5 rounded-2xl
                         bg-purple-600 text-white font-bold text-xl md:text-2xl
                         active:bg-purple-700 active:scale-[0.98] transition-all shadow-lg"
            >
              {currentChapter.isEnding ? '🎉 Finish Story' : 'What happens next? →'}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Choosing what happens next ──
  if (step === 'choosing' && currentChapter) {
    return (
      <ChapterChoices
        chapterNumber={currentChapter.chapterNumber}
        chapterTitle={currentChapter.title}
        choices={currentChapter.choices}
        onChoose={handleChoice}
      />
    );
  }

  // ── Story ending celebration ──
  if (step === 'ending' && currentChapter) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white">
        <div className="text-center pt-4 md:pt-6 pb-2 px-4">
          <span className="inline-block bg-purple-100 text-purple-700 text-xs md:text-sm font-bold px-3 py-1 rounded-full mb-1">
            Final Chapter
          </span>
          <h2 className="text-lg md:text-xl font-bold text-purple-700">{currentChapter.title}</h2>
        </div>

        <main className="pb-8 pt-0">
          <ReadingSession
            text={currentChapter.text}
            stickerRegistry={stickerRegistryRef.current}
            knownStickerLabels={knownStickerLabels}
            storyTitle={currentChapter.title}
            onReset={onReset}
          />
        </main>

        <div className="max-w-lg md:max-w-2xl mx-auto px-4 pb-8">
          <div className="rounded-2xl bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-100 p-6 md:p-8 shadow-sm text-center">
            <p className="text-5xl md:text-6xl mb-3">🎉📖✨</p>
            <h3 className="text-2xl md:text-3xl font-extrabold text-purple-700 mb-2">
              The End!
            </h3>
            <p className="text-purple-600 font-medium text-base md:text-lg mb-1">
              You read {storyContext.chapters.length} chapters!
            </p>
            <p className="text-gray-500 text-sm md:text-base mb-5">
              Great job, storyteller! Every choice you made shaped this adventure.
            </p>
            <p className="text-green-600 text-sm font-medium mb-4">✅ Saved to your story library</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setStoryContext({ prompt: '', readingLevel, chapters: [] });
                  setCurrentChapter(null);
                  chaptersDetailRef.current = [];
                  savedStoryIdRef.current = null;
                  stickerRegistryRef.current = new Map();
                  setStep('prompt');
                }}
                className="flex-1 py-3 md:py-4 rounded-2xl bg-purple-600 text-white font-bold text-lg md:text-xl
                           active:bg-purple-700 transition-colors shadow-md"
              >
                🗺️ New Adventure
              </button>
              <button
                type="button"
                onClick={onReset}
                className="py-3 md:py-4 px-5 md:px-6 rounded-2xl bg-gray-100 text-gray-500 font-bold text-lg md:text-xl
                           active:bg-gray-200 transition-colors"
              >
                Home
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default AdventureMode;
