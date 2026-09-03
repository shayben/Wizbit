import React, { useState, useRef } from 'react';
import { recognizeSpeech } from '../services/speechService';

interface StoryPromptScreenProps {
  readingLevel: string;
  levelEmoji: string;
  levelLabel: string;
  onStart: (prompt: string) => void;
  onBack: () => void;
}

const THEMES = [
  { emoji: '🏴‍☠️', label: 'Pirates', prompt: 'A brave young pirate searching for hidden treasure' },
  { emoji: '🚀', label: 'Space', prompt: 'An astronaut kid exploring a mysterious planet' },
  { emoji: '🧙', label: 'Magic', prompt: 'A young wizard discovering a secret spell book' },
  { emoji: '🦕', label: 'Dinosaurs', prompt: 'A time traveler who lands in the age of dinosaurs' },
  { emoji: '🧜‍♀️', label: 'Ocean', prompt: 'A mermaid who finds a secret underwater city' },
  { emoji: '🐉', label: 'Dragons', prompt: 'A kid who befriends a baby dragon' },
  { emoji: '🕵️', label: 'Mystery', prompt: 'A young detective solving a puzzle in a spooky mansion' },
  { emoji: '🦸', label: 'Superheroes', prompt: 'A kid who discovers they have a secret superpower' },
];

function buildThemePrompt(selectedLabels: string[]): string {
  const ideas = THEMES
    .filter((theme) => selectedLabels.includes(theme.label))
    .map((theme) => theme.prompt);

  return ideas.length > 0
    ? `Combine all of these themes in one story: ${ideas.join('; ')}`
    : '';
}

const StoryPromptScreen: React.FC<StoryPromptScreenProps> = ({
  readingLevel,
  levelEmoji,
  levelLabel,
  onStart,
  onBack,
}) => {
  const [prompt, setPrompt] = useState('');
  const [selectedThemes, setSelectedThemes] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  const [sttError, setSttError] = useState<string | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  const handleTheme = (themeLabel: string) => {
    const nextThemes = selectedThemes.includes(themeLabel)
      ? selectedThemes.filter((label) => label !== themeLabel)
      : [...selectedThemes, themeLabel];

    setSelectedThemes(nextThemes);
    setPrompt(buildThemePrompt(nextThemes));
  };

  const handleSubmit = () => {
    const trimmed = prompt.trim();
    if (trimmed) onStart(trimmed);
  };

  const handleMicToggle = async () => {
    if (listening) {
      cancelRef.current?.();
      cancelRef.current = null;
      setListening(false);
      return;
    }

    setListening(true);
    setSttError(null);
    const { promise, cancel } = recognizeSpeech();
    cancelRef.current = cancel;

    try {
      const text = await promise;
      if (text) {
        setSelectedThemes([]);
        setPrompt((prev) => (prev ? `${prev} ${text}` : text));
      }
    } catch (err) {
      setSttError(err instanceof Error ? err.message : 'Speech recognition failed');
    } finally {
      cancelRef.current = null;
      setListening(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white p-6 md:p-10 pt-8">
      <div className="max-w-lg md:max-w-2xl mx-auto">
        <button
          type="button"
          onClick={onBack}
          className="text-indigo-500 font-medium text-sm md:text-base mb-4"
        >
          ← Back
        </button>

        <h2 className="text-2xl md:text-3xl font-bold text-purple-700 mb-1">
          🗺️ Create Your Own Story
        </h2>
        <p className="text-gray-400 text-sm md:text-base mb-2">
          Reading level: {levelEmoji} {levelLabel} (Grade {readingLevel})
        </p>
        <p className="text-gray-500 text-sm md:text-base mb-5">
          Pick one or more themes, type, or <span className="font-semibold text-purple-600">speak</span> your adventure idea!
        </p>

        {/* Theme quick-picks */}
        <div className="grid grid-cols-4 gap-2 md:gap-3 mb-5">
          {THEMES.map((theme) => (
            <button
              key={theme.label}
              type="button"
              onClick={() => handleTheme(theme.label)}
              aria-pressed={selectedThemes.includes(theme.label)}
              className={`flex flex-col items-center gap-1 py-3 md:py-4 px-1 rounded-2xl border transition-colors
                ${selectedThemes.includes(theme.label)
                  ? 'bg-purple-100 border-purple-300 shadow-sm'
                  : 'bg-white border-gray-100 shadow-sm active:bg-purple-50 active:border-purple-200'
                }`}
            >
              <span className="text-2xl md:text-3xl">{theme.emoji}</span>
              <span className="text-xs md:text-sm font-semibold text-gray-600">{theme.label}</span>
            </button>
          ))}
        </div>

        {/* Custom prompt input with mic button */}
        <div className="relative mb-4">
          <textarea
            value={prompt}
            onChange={(e) => {
              setSelectedThemes([]);
              setPrompt(e.target.value);
            }}
            placeholder="A dog who learns to fly and saves the day..."
            rows={3}
            className="w-full rounded-2xl border border-gray-200 p-4 md:p-5 pr-14 text-base md:text-lg
                       focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-purple-300
                       placeholder:text-gray-300 resize-none"
          />
          <button
            type="button"
            onClick={handleMicToggle}
            aria-label={listening ? 'Stop recording' : 'Speak your story idea'}
            className={`absolute right-3 top-3 w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center
                        transition-all shadow-sm
                        ${listening
                          ? 'bg-red-500 text-white animate-pulse'
                          : 'bg-purple-100 text-purple-600 active:bg-purple-200'
                        }`}
          >
            {listening ? (
              <svg className="w-5 h-5 md:w-6 md:h-6" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
          </button>
        </div>

        {/* STT status / error */}
        {listening && (
          <p className="text-purple-600 text-sm font-medium mb-3 animate-pulse">
            🎙️ Listening… speak your story idea
          </p>
        )}
        {sttError && (
          <p className="text-red-500 text-sm mb-3">{sttError}</p>
        )}

        {/* Start button */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!prompt.trim()}
          className={`w-full py-4 md:py-5 rounded-2xl font-bold text-xl md:text-2xl transition-all shadow-md
            ${prompt.trim()
              ? 'bg-purple-600 text-white active:bg-purple-700 active:scale-[0.98]'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
        >
          🗺️ Begin Adventure!
        </button>
      </div>
    </div>
  );
};

export default StoryPromptScreen;
