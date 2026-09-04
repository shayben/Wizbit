/**
 * NumberLine — the representational model for counting on and back.
 *
 * Shows the jump a problem describes, which is exactly the strategy the
 * per-skill tips already tell children to use ("start with the bigger number
 * and count on"). Seeing the jump is what makes that instruction usable.
 */

import React from 'react';

export interface NumberLineProps {
  min: number;
  max: number;
  /** Where the jump starts. */
  from?: number;
  /** Where the jump ends. Omit to show the line alone. */
  to?: number;
  /** Label every nth tick. Defaults to a sensible value for the range. */
  labelEvery?: number;
}

const NumberLine: React.FC<NumberLineProps> = ({ min, max, from, to, labelEvery }) => {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const span = hi - lo;
  if (span <= 0) return null;

  const step = labelEvery ?? (span <= 10 ? 1 : span <= 20 ? 2 : Math.ceil(span / 10));
  const ticks = Array.from({ length: span + 1 }, (_, i) => lo + i);

  const percent = (value: number) => ((value - lo) / span) * 100;
  const hasJump = from !== undefined && to !== undefined;
  const jumpStart = hasJump ? Math.min(from, to) : 0;
  const jumpEnd = hasJump ? Math.max(from, to) : 0;

  const description = hasJump
    ? `Number line from ${lo} to ${hi} showing a jump from ${from} to ${to}`
    : `Number line from ${lo} to ${hi}`;

  return (
    <div className="w-full py-6 px-3" role="img" aria-label={description}>
      <div className="relative h-12">
        <div className="absolute inset-x-0 top-6 h-1 bg-violet-200 rounded-full" />

        {hasJump && (
          <div
            className="absolute top-6 h-1 bg-violet-500 rounded-full"
            style={{ left: `${percent(jumpStart)}%`, width: `${percent(jumpEnd) - percent(jumpStart)}%` }}
          />
        )}

        {ticks.map((value) => {
          const labelled = (value - lo) % step === 0 || value === hi;
          const isEndpoint = hasJump && (value === from || value === to);
          return (
            <div
              key={value}
              className="absolute top-0 flex flex-col items-center -translate-x-1/2"
              style={{ left: `${percent(value)}%` }}
            >
              <span
                className={`rounded-full ${
                  isEndpoint
                    ? 'w-4 h-4 md:w-5 md:h-5 bg-violet-600 mt-4'
                    : labelled
                      ? 'w-2 h-2 bg-violet-400 mt-5.5'
                      : 'w-1 h-1 bg-violet-300 mt-6'
                }`}
              />
              {labelled && (
                <span className={`mt-1 text-xs md:text-sm font-bold ${
                  isEndpoint ? 'text-violet-700' : 'text-gray-400'
                }`}>
                  {value}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default NumberLine;
