/**
 * Presentation metadata for math-fact mastery levels.
 *
 * Kept beside the grid component but in its own module so the component file
 * exports only a component.
 */

import type { FactMasteryLevel } from '../../services/mathFactService';

export const LEVEL_STYLE: Record<FactMasteryLevel, { cell: string; swatch: string; title: string }> = {
  fluent: { cell: 'bg-emerald-500 text-white', swatch: 'bg-emerald-500', title: 'Instant recall' },
  accurate: { cell: 'bg-emerald-200 text-emerald-900', swatch: 'bg-emerald-200', title: 'Correct, still slow' },
  learning: { cell: 'bg-amber-200 text-amber-900', swatch: 'bg-amber-200', title: 'Still learning' },
  new: { cell: 'bg-gray-100 text-gray-400', swatch: 'bg-gray-100', title: 'Not tried yet' },
};

export const MASTERY_LEGEND: Array<{ level: FactMasteryLevel; label: string }> = [
  { level: 'fluent', label: 'Instant' },
  { level: 'accurate', label: 'Correct' },
  { level: 'learning', label: 'Learning' },
  { level: 'new', label: 'New' },
];
