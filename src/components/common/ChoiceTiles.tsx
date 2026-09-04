/**
 * ChoiceTiles — large tappable answer options.
 *
 * The shared answer surface for comprehension questions, sight-word checks and
 * multiple-choice math. Tiles stay readable and tappable at a first grader's
 * accuracy, and after answering they colour to show what was right without
 * hiding what the child chose.
 */

import React from 'react';

export interface ChoiceTilesProps {
  choices: string[];
  /** Index the child selected, or null before they answer. */
  selectedIndex: number | null;
  /** Correct index — only supply once the answer is revealed. */
  correctIndex?: number;
  /** True once the answer has been checked; tiles lock and colour. */
  revealed?: boolean;
  onSelect: (index: number) => void;
  /** Force a single column, e.g. for long sentence choices. */
  singleColumn?: boolean;
  /** Accessible name for the group. */
  label?: string;
}

const BASE =
  'w-full text-left rounded-2xl border-2 p-4 md:p-5 text-lg md:text-xl font-semibold ' +
  'transition-colors active:scale-[0.99]';

const ChoiceTiles: React.FC<ChoiceTilesProps> = ({
  choices,
  selectedIndex,
  correctIndex,
  revealed = false,
  onSelect,
  singleColumn = false,
  label = 'Answer choices',
}) => {
  const longest = choices.reduce((max, choice) => Math.max(max, choice.length), 0);
  const columns = singleColumn || longest > 24 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2';

  return (
    <div role="group" aria-label={label} className={`grid ${columns} gap-3 w-full`}>
      {choices.map((choice, index) => {
        const isSelected = selectedIndex === index;
        const isCorrect = revealed && correctIndex === index;
        const isWrongPick = revealed && isSelected && correctIndex !== index;

        const tone = isCorrect
          ? 'bg-green-50 border-green-400 text-green-800'
          : isWrongPick
            ? 'bg-red-50 border-red-300 text-red-800'
            : isSelected
              ? 'bg-indigo-50 border-indigo-400 text-indigo-800'
              : 'bg-white border-gray-200 text-gray-700 active:bg-indigo-50';

        return (
          <button
            key={`${index}-${choice}`}
            type="button"
            aria-pressed={isSelected}
            disabled={revealed}
            onClick={() => onSelect(index)}
            className={`${BASE} ${tone} disabled:active:scale-100`}
          >
            <span className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className={`shrink-0 w-8 h-8 rounded-full grid place-items-center text-base font-extrabold ${
                  isCorrect ? 'bg-green-500 text-white'
                    : isWrongPick ? 'bg-red-400 text-white'
                    : isSelected ? 'bg-indigo-500 text-white'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {isCorrect ? '✓' : isWrongPick ? '✕' : String.fromCharCode(65 + index)}
              </span>
              <span className="flex-1 leading-snug">{choice}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default ChoiceTiles;
