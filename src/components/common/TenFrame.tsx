/**
 * TenFrame — the standard concrete model for numbers to 20.
 *
 * First-grade math is taught concrete → representational → abstract, and
 * `3 + 4 = ?` as bare text skips the first two stages. A ten-frame makes
 * "making ten" visible, which is the strategy the curriculum actually teaches.
 */

import React from 'react';

export interface TenFrameProps {
  /** How many counters to fill, 0–20. Values above 20 are clamped. */
  count: number;
  /** Optional second group, drawn in a contrasting colour (for addition). */
  secondCount?: number;
  label?: string;
}

const CELLS_PER_FRAME = 10;

function Frame({ filled, offset, secondFrom }: { filled: number; offset: number; secondFrom: number }) {
  return (
    <div className="grid grid-cols-5 gap-1 md:gap-1.5 p-1.5 md:p-2 rounded-xl bg-white border-2 border-violet-200">
      {Array.from({ length: CELLS_PER_FRAME }, (_, i) => {
        const absoluteIndex = offset + i;
        const isFilled = i < filled;
        const isSecond = isFilled && absoluteIndex >= secondFrom;
        return (
          <span
            key={i}
            className={`w-7 h-7 md:w-9 md:h-9 rounded-full border ${
              isFilled
                ? isSecond
                  ? 'bg-amber-400 border-amber-500'
                  : 'bg-violet-500 border-violet-600'
                : 'bg-violet-50 border-violet-200'
            }`}
          />
        );
      })}
    </div>
  );
}

const TenFrame: React.FC<TenFrameProps> = ({ count, secondCount = 0, label }) => {
  const first = Math.max(0, Math.min(20, Math.floor(count)));
  const second = Math.max(0, Math.min(20 - first, Math.floor(secondCount)));
  const total = first + second;

  const description = label
    ?? (second > 0 ? `Ten frame showing ${first} plus ${second}` : `Ten frame showing ${total}`);

  return (
    <div className="flex flex-col items-center gap-2" role="img" aria-label={description}>
      <div className="flex gap-2 md:gap-3">
        <Frame filled={Math.min(CELLS_PER_FRAME, total)} offset={0} secondFrom={first} />
        {total > CELLS_PER_FRAME && (
          <Frame filled={total - CELLS_PER_FRAME} offset={CELLS_PER_FRAME} secondFrom={first} />
        )}
      </div>
    </div>
  );
};

export default TenFrame;
