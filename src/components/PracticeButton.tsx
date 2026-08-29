/**
 * PracticeButton — word practice assessment button with recording and feedback.
 */

import React, { useState, useCallback, useRef } from 'react';
import { assessWord } from '../services/speechService';
import type { WordResult } from '../services/speechService';
import { cleanReadableWord } from '../services/phonicsService';

interface PracticeButtonProps {
  word: string;
  locale?: string;
  onResult?: (result: WordResult) => void;
}

const PracticeButton: React.FC<PracticeButtonProps> = ({ word, locale = 'en-US', onResult }) => {
  const [practicing, setPracticing] = useState(false);
  const [practiceScore, setPracticeScore] = useState<number | null>(null);
  const [practiceError, setPracticeError] = useState<string | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  const cleanWord = cleanReadableWord(word);

  const handlePractice = useCallback(async () => {
    setPracticing(true);
    setPracticeScore(null);
    setPracticeError(null);

    const { promise, cancel } = assessWord(cleanWord, locale);
    cancelRef.current = cancel;

    try {
      const result = await promise;
      setPracticeScore(Math.round(result.accuracyScore));
      onResult?.(result);
    } catch (err) {
      setPracticeError(err instanceof Error ? err.message : 'Try again');
    } finally {
      setPracticing(false);
      cancelRef.current = null;
    }
  }, [cleanWord, locale, onResult]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => { cancelRef.current?.(); };
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={handlePractice}
        disabled={practicing}
        className={`w-full py-2.5 md:py-3 rounded-xl font-bold text-base md:text-lg transition-colors ${
          practicing
            ? 'bg-green-200 text-green-700 animate-pulse'
            : 'bg-green-500 text-white active:bg-green-600'
        }`}
      >
        {practicing ? '🎤 Listening…' : '🎤 Practice this word'}
      </button>

      {practiceScore !== null && (
        <div className={`mt-2 text-center py-2 md:py-3 rounded-xl font-bold text-base md:text-lg ${
          practiceScore >= 80
            ? 'bg-green-50 text-green-700'
            : practiceScore >= 50
              ? 'bg-amber-50 text-amber-700'
              : 'bg-red-50 text-red-700'
        }`}>
          {practiceScore >= 80 ? '🎉 Great job!' : practiceScore >= 50 ? '👍 Getting closer!' : '💪 Try again!'}{' '}
          Score: {practiceScore}
        </div>
      )}
      {practiceError && (
        <div className="mt-2 text-center py-2 rounded-xl bg-gray-50 text-gray-500 text-sm md:text-base">
          {practiceError}
        </div>
      )}
    </>
  );
};

export default PracticeButton;
