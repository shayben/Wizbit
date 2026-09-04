/**
 * ProgressRing — a compact circular progress indicator.
 *
 * Used for the daily goal, mastery percentages and session results.
 */

import React from 'react';

export interface ProgressRingProps {
  /** 0–100. Values outside the range are clamped. */
  percent: number;
  size?: number;
  strokeWidth?: number;
  /** Text drawn in the centre. Defaults to the rounded percentage. */
  label?: string;
  sublabel?: string;
  colorClass?: string;
  trackClass?: string;
}

const ProgressRing: React.FC<ProgressRingProps> = ({
  percent,
  size = 96,
  strokeWidth = 9,
  label,
  sublabel,
  colorClass = 'text-violet-500',
  trackClass = 'text-violet-100',
}) => {
  const safe = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (safe / 100) * circumference;

  return (
    <div
      className="relative inline-grid place-items-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${Math.round(safe)} percent${sublabel ? ` ${sublabel}` : ''}`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          className={trackClass} stroke="currentColor" strokeWidth={strokeWidth} fill="none"
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          className={`${colorClass} transition-[stroke-dasharray] duration-500`}
          stroke="currentColor" strokeWidth={strokeWidth} fill="none" strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
        />
      </svg>
      <span className="absolute text-center leading-tight">
        <span className="block font-extrabold text-gray-800" style={{ fontSize: size / 4 }}>
          {label ?? `${Math.round(safe)}%`}
        </span>
        {sublabel && <span className="block text-[10px] md:text-xs text-gray-400">{sublabel}</span>}
      </span>
    </div>
  );
};

export default ProgressRing;
