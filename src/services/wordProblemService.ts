/**
 * Word problems.
 *
 * Bare computation (`7 × 8 = ?`) is only half of elementary math. Both grade 1
 * and grade 3 standards are dominated by problems stated in words, and the
 * skill of turning a sentence into an equation is what actually transfers.
 *
 * Problems come from the AI proxy so they can use the child's own name and
 * interests, with a deterministic template generator as the fallback — the
 * templates are seeded, so the same seed always yields the same problem, which
 * keeps them testable and lets a duel serve both players identical questions.
 */

import { z } from 'zod';
import { apiPost } from './apiClient';
import { gradeIndex, type GradeCode } from '../types/grade';

export type ProblemStructure = 'join' | 'separate' | 'compare' | 'equal-groups' | 'multi-step';

export interface WordProblem {
  id: string;
  /** The problem as the child reads (or hears) it. */
  text: string;
  answer: number;
  /** Unit for the answer, e.g. "apples". Shown next to the input. */
  unit: string;
  structure: ProblemStructure;
  /** The equation that solves it, revealed after answering. */
  equation: string;
  /** One-line explanation of how to set it up. */
  strategy: string;
}

export const STRUCTURE_META: Record<ProblemStructure, { label: string; emoji: string }> = {
  join: { label: 'Putting together', emoji: '➕' },
  separate: { label: 'Taking away', emoji: '➖' },
  compare: { label: 'Comparing', emoji: '⚖️' },
  'equal-groups': { label: 'Equal groups', emoji: '✖️' },
  'multi-step': { label: 'Two steps', emoji: '🧠' },
};

/** Structures that are on-level for a grade. */
export function structuresForGrade(grade: GradeCode): ProblemStructure[] {
  const index = gradeIndex(grade);
  if (index <= 1) return ['join', 'separate', 'compare'];
  if (index === 2) return ['join', 'separate', 'compare', 'equal-groups'];
  return ['join', 'separate', 'compare', 'equal-groups', 'multi-step'];
}

// ---------------------------------------------------------------------------
// Deterministic template generator
// ---------------------------------------------------------------------------

/** Small deterministic PRNG so a seed always yields the same problem set. */
export function seededRandom(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5; state >>>= 0;
    return state / 0xffffffff;
  };
}

const NAMES = ['Maya', 'Ben', 'Ava', 'Noah', 'Lily', 'Sam', 'Ella', 'Leo', 'Zoe', 'Max'];
const THINGS = [
  { plural: 'apples', singular: 'apple' },
  { plural: 'stickers', singular: 'sticker' },
  { plural: 'marbles', singular: 'marble' },
  { plural: 'books', singular: 'book' },
  { plural: 'shells', singular: 'shell' },
  { plural: 'crayons', singular: 'crayon' },
  { plural: 'cookies', singular: 'cookie' },
  { plural: 'coins', singular: 'coin' },
];
const CONTAINERS = ['boxes', 'baskets', 'bags', 'jars', 'shelves'];

function pick<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length) % items.length];
}

function intBetween(min: number, max: number, random: () => number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

/** Operand ceiling that keeps a problem arithmetically on-level. */
function rangeForGrade(grade: GradeCode): number {
  switch (gradeIndex(grade)) {
    case 0: return 10;
    case 1: return 20;
    case 2: return 100;
    case 3: return 12;   // grade 3 leans on multiplication facts, not big sums
    case 4: return 25;
    default: return 50;
  }
}

function buildProblem(
  structure: ProblemStructure,
  grade: GradeCode,
  random: () => number,
  index: number,
): WordProblem {
  const name = pick(NAMES, random);
  const friend = pick(NAMES.filter((n) => n !== name), random);
  const thing = pick(THINGS, random);
  const max = rangeForGrade(grade);
  const id = `wp_${structure}_${index}`;

  switch (structure) {
    case 'join': {
      const a = intBetween(2, max, random);
      const b = intBetween(1, Math.max(1, max - a), random);
      return {
        id,
        text: `${name} has ${a} ${thing.plural}. ${friend} gives ${name} ${b} more. How many ${thing.plural} does ${name} have now?`,
        answer: a + b,
        unit: thing.plural,
        structure,
        equation: `${a} + ${b} = ${a + b}`,
        strategy: 'Putting groups together means adding.',
      };
    }
    case 'separate': {
      const total = intBetween(4, max, random);
      const taken = intBetween(1, total - 1, random);
      return {
        id,
        text: `${name} had ${total} ${thing.plural} and gave ${taken} to ${friend}. How many ${thing.plural} does ${name} have left?`,
        answer: total - taken,
        unit: thing.plural,
        structure,
        equation: `${total} − ${taken} = ${total - taken}`,
        strategy: 'Giving some away means subtracting from the total.',
      };
    }
    case 'compare': {
      const bigger = intBetween(5, max, random);
      const smaller = intBetween(1, bigger - 1, random);
      return {
        id,
        text: `${name} has ${bigger} ${thing.plural}. ${friend} has ${smaller}. How many more ${thing.plural} does ${name} have than ${friend}?`,
        answer: bigger - smaller,
        unit: thing.plural,
        structure,
        equation: `${bigger} − ${smaller} = ${bigger - smaller}`,
        strategy: '"How many more" means find the difference — subtract.',
      };
    }
    case 'equal-groups': {
      const groups = intBetween(2, Math.min(10, max), random);
      const each = intBetween(2, Math.min(10, max), random);
      const container = pick(CONTAINERS, random);
      return {
        id,
        text: `${name} packs ${thing.plural} into ${groups} ${container}. Each one holds ${each} ${thing.plural}. How many ${thing.plural} are there altogether?`,
        answer: groups * each,
        unit: thing.plural,
        structure,
        equation: `${groups} × ${each} = ${groups * each}`,
        strategy: 'Equal groups means multiply: number of groups × size of each group.',
      };
    }
    case 'multi-step': {
      const groups = intBetween(2, 9, random);
      const each = intBetween(2, 9, random);
      const used = intBetween(1, groups * each - 1, random);
      return {
        id,
        text: `${name} has ${groups} ${pick(CONTAINERS, random)} with ${each} ${thing.plural} in each. ${name} uses ${used} ${thing.plural}. How many ${thing.plural} are left?`,
        answer: groups * each - used,
        unit: thing.plural,
        structure,
        equation: `(${groups} × ${each}) − ${used} = ${groups * each - used}`,
        strategy: 'Two steps: find the total first, then take away what was used.',
      };
    }
  }
}

/**
 * Generate word problems offline.
 *
 * @param seed Same seed → same problems, so a duel can serve both players the
 *             identical set and tests stay deterministic.
 */
export function generateOfflineWordProblems(grade: GradeCode, count: number, seed = 1): WordProblem[] {
  const random = seededRandom(seed);
  const structures = structuresForGrade(grade);
  return Array.from({ length: Math.max(0, count) }, (_, index) =>
    buildProblem(structures[index % structures.length], grade, random, index),
  );
}

// ---------------------------------------------------------------------------
// AI generation
// ---------------------------------------------------------------------------

const AiProblemSchema = z.object({
  text: z.string().min(1),
  answer: z.number(),
  unit: z.string().default(''),
  structure: z.enum(['join', 'separate', 'compare', 'equal-groups', 'multi-step']),
  equation: z.string().default(''),
  strategy: z.string().default(''),
});

const AiResponseSchema = z.object({ problems: z.array(AiProblemSchema).min(1) });

export interface WordProblemRequest {
  grade: GradeCode;
  count: number;
  /** The learner's name, so problems are about them. */
  learnerName?: string;
  /** A theme the child likes, e.g. "dinosaurs". */
  interest?: string;
  seed?: number;
}

/**
 * Generate word problems, falling back to templates on any failure.
 *
 * The model is asked for problems that are *solvable from the text alone* and
 * whose answers are whole numbers, because the answer pad only accepts numbers.
 */
export async function generateWordProblems({
  grade, count, learnerName, interest, seed = 1,
}: WordProblemRequest): Promise<{ problems: WordProblem[]; offline: boolean }> {
  const structures = structuresForGrade(grade);

  try {
    const data = await apiPost<unknown, { content: string }>('/openai/chat', {
      purpose: 'learning-activity',
      messages: [
        {
          role: 'system',
          content: [
            `Write ${count} math word problems for a grade ${grade} child.`,
            `Use only these problem structures: ${structures.join(', ')}.`,
            'Every answer must be a whole number the child can type. Keep numbers on-level for the grade.',
            gradeIndex(grade) <= 1
              ? 'Use short sentences and only words a beginning reader knows.'
              : 'Vary the wording so the child has to decide which operation to use.',
            'Return ONLY JSON: {"problems":[{"text":string,"answer":number,"unit":string,"structure":string,"equation":string,"strategy":string}]}',
          ].join(' '),
        },
        {
          role: 'user',
          content: [
            learnerName ? `The child is called ${learnerName}.` : 'Use varied first names.',
            interest ? `They like ${interest} — use that as the theme.` : '',
          ].filter(Boolean).join(' '),
        },
      ],
      temperature: 0.8,
      max_tokens: 900,
      response_format: 'json_object',
    });

    const content = (data.content ?? '').replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = AiResponseSchema.safeParse(JSON.parse(content));

    if (parsed.success) {
      const problems = parsed.data.problems
        .filter((problem) => Number.isFinite(problem.answer) && Number.isInteger(problem.answer))
        .map((problem, index) => ({
          id: `wp_ai_${index}`,
          text: problem.text.trim(),
          answer: problem.answer,
          unit: problem.unit.trim(),
          structure: problem.structure,
          equation: problem.equation.trim(),
          strategy: problem.strategy.trim() || STRUCTURE_META[problem.structure].label,
        }));
      if (problems.length > 0) return { problems, offline: false };
    }
  } catch { /* fall through to templates */ }

  return { problems: generateOfflineWordProblems(grade, count, seed), offline: true };
}
