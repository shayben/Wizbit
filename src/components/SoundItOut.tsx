import React, { useCallback, useMemo, useState } from 'react';
import { speakSound, speakWord } from '../services/speechService';
import {
  cleanReadableWord,
  detectReadingLanguage,
  getSoundParts,
  readingLocale,
} from '../services/phonicsService';

interface SoundItOutProps {
  word: string;
}

const SoundItOut: React.FC<SoundItOutProps> = ({ word }) => {
  const cleanWord = useMemo(() => cleanReadableWord(word), [word]);
  const parts = useMemo(() => getSoundParts(word), [word]);
  const locale = readingLocale(word);
  const isHebrew = detectReadingLanguage(word) === 'he';
  const [playing, setPlaying] = useState(false);

  const handleSoundOut = useCallback(async () => {
    if (playing) return;
    setPlaying(true);
    try {
      for (const part of parts) {
        if (!part.silent) await speakSound(part.text, locale, part.phoneme);
      }
      await speakWord(cleanWord, locale);
    } finally {
      setPlaying(false);
    }
  }, [cleanWord, locale, parts, playing]);

  if (parts.length === 0) return null;

  return (
    <div className="mb-3 md:mb-4 rounded-xl bg-white/70 border border-indigo-100 p-3">
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-sm md:text-base font-bold text-indigo-700">Sound it out</p>
        <button
          type="button"
          onClick={handleSoundOut}
          disabled={playing}
          className={`rounded-lg px-3 py-1.5 text-sm md:text-base font-bold transition-colors ${
            playing
              ? 'bg-indigo-100 text-indigo-400'
              : 'bg-indigo-500 text-white active:bg-indigo-600'
          }`}
        >
          {playing ? '🔊 Playing…' : '▶ Sounds + word'}
        </button>
      </div>
      <div
        className="flex items-center gap-1.5 flex-wrap"
        dir={isHebrew ? 'rtl' : 'ltr'}
        aria-label={`Sounds in ${cleanWord}`}
      >
        {parts.map((part, index) => (
          <React.Fragment key={`${part.text}-${index}`}>
            {index > 0 && <span className="text-indigo-300 font-bold" aria-hidden="true">·</span>}
            <button
              type="button"
              onClick={() => {
                if (!part.silent) void speakSound(part.text, locale, part.phoneme);
              }}
              disabled={part.silent}
              aria-label={part.silent ? `${part.text}, quiet letter` : `Hear ${part.text}`}
              title={part.silent ? 'Quiet letter' : `Hear ${part.text}`}
              className={`min-w-11 min-h-11 px-2 rounded-xl text-2xl md:text-3xl font-bold border transition-colors ${
                part.silent
                  ? 'bg-gray-50 border-dashed border-gray-300 text-gray-400'
                  : 'bg-indigo-50 border-indigo-200 text-indigo-700 active:bg-indigo-200'
              }`}
            >
              {part.text}
            </button>
          </React.Fragment>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-2">
        Tap each {isHebrew ? 'letter and vowel mark' : 'sound'}, then blend the word.
      </p>
    </div>
  );
};

export default SoundItOut;
