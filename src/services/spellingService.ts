/**
 * Spelling dictation.
 *
 * `SoundItOut` takes a child from letters to sounds; this is the missing
 * production half — hear the word, then write it. Dictation is how spelling is
 * actually assessed in class, and it is the cheapest way to find out whether a
 * phonics pattern has stuck.
 *
 * Words are grouped by the pattern they teach so feedback can name the rule
 * ("this word uses the silent e"), not just mark the answer wrong.
 */

import { createScopedStore } from './scopedStore';
import {
  buildReviewQueue,
  parseSrsCollection,
  recordSrsReview,
  summarizeSrs,
  type SrsCollection,
  type SrsSummary,
} from './srsService';
import { gradeIndex, type GradeCode } from '../types/grade';

export interface SpellingPattern {
  id: string;
  grade: GradeCode;
  name: string;
  /** Child-facing rule, shown as the hint after a miss. */
  rule: string;
  emoji: string;
  words: string[];
}

export const SPELLING_PATTERNS: SpellingPattern[] = [
  // ── Kindergarten / Grade 1 ──
  { id: 'cvc-a', grade: 'K', name: 'Short a', emoji: '🎒', rule: 'Three sounds, short a in the middle: c-a-t.',
    words: ['cat', 'map', 'bag', 'sad', 'hat', 'ran', 'jam', 'tap'] },
  { id: 'cvc-i-o', grade: 'K', name: 'Short i and o', emoji: '🐷', rule: 'Short vowel in the middle: p-i-g, d-o-g.',
    words: ['pig', 'big', 'hot', 'dog', 'top', 'sit', 'fox', 'mop'] },
  { id: 'digraph', grade: '1', name: 'Two letters, one sound', emoji: '🚢', rule: 'sh, ch, th and wh each make ONE sound.',
    words: ['ship', 'chin', 'that', 'when', 'wish', 'much', 'bath', 'shop'] },
  { id: 'blend', grade: '1', name: 'Beginning blends', emoji: '🐸', rule: 'Both letters keep their sound: f-r-og.',
    words: ['frog', 'stop', 'clap', 'grin', 'swim', 'plan', 'trip', 'flag'] },
  { id: 'silent-e', grade: '1', name: 'Silent e', emoji: '🎂', rule: 'A silent e at the end makes the vowel say its name.',
    words: ['cake', 'bike', 'home', 'cute', 'note', 'game', 'ride', 'time'] },
  { id: 'plural-s', grade: '1', name: 'More than one', emoji: '🧦', rule: 'Add -s to most words to mean more than one.',
    words: ['cats', 'dogs', 'hats', 'cups', 'beds', 'pens', 'maps', 'bugs'] },

  // ── Grade 2 ──
  { id: 'vowel-team', grade: '2', name: 'Vowel teams', emoji: '⛵', rule: 'Two vowels walking: the first one usually talks.',
    words: ['rain', 'boat', 'team', 'green', 'road', 'seat', 'coat', 'clean'] },
  { id: 'r-controlled', grade: '2', name: 'Bossy r', emoji: '⭐', rule: 'The r changes the vowel sound: ar, or, er, ir, ur.',
    words: ['star', 'bird', 'farm', 'turn', 'corn', 'her', 'hurt', 'shirt'] },
  { id: 'plural-es', grade: '2', name: 'Adding -es', emoji: '🧺', rule: 'Words ending in s, x, ch or sh take -es.',
    words: ['boxes', 'buses', 'wishes', 'benches', 'foxes', 'dishes', 'brushes', 'glasses'] },

  // ── Grade 3 ──
  { id: 'suffix-ed-ing', grade: '3', name: 'Adding -ed and -ing', emoji: '🏃', rule: 'Double the last letter after a short vowel: run → running.',
    words: ['running', 'stopped', 'hopping', 'planned', 'swimming', 'clapped', 'jogging', 'shopped'] },
  { id: 'drop-e', grade: '3', name: 'Dropping the e', emoji: '✂️', rule: 'Drop the silent e before adding -ing: make → making.',
    words: ['making', 'hoping', 'riding', 'writing', 'taking', 'having', 'living', 'giving'] },
  { id: 'y-to-i', grade: '3', name: 'Changing y to i', emoji: '🦋', rule: 'Change y to i before adding -es or -ed: baby → babies.',
    words: ['babies', 'cities', 'cried', 'tried', 'stories', 'families', 'puppies', 'carried'] },
  { id: 'homophone', grade: '3', name: 'Sound-alikes', emoji: '👯', rule: 'These words sound the same but mean different things — listen to the sentence.',
    words: ['their', 'there', 'they\'re', 'your', 'you\'re', 'its', 'it\'s', 'here', 'hear'] },
  { id: 'prefix', grade: '3', name: 'Prefixes', emoji: '🔁', rule: 'A prefix goes in front and changes the meaning: un- means "not".',
    words: ['unhappy', 'redo', 'unlock', 'preheat', 'undo', 'rewrite', 'unfair', 'replay'] },
  { id: 'tricky-3', grade: '3', name: 'Tricky words', emoji: '🧠', rule: 'These do not follow a rule — picture the word, then write it.',
    words: ['because', 'people', 'friend', 'enough', 'through', 'always', 'thought', 'different'] },

  // ── Grades 4–5 ──
  { id: 'suffix-tion', grade: '4', name: 'The -tion ending', emoji: '🎬', rule: 'The /shun/ sound at the end is usually spelled -tion.',
    words: ['action', 'station', 'nation', 'motion', 'section', 'question', 'fraction', 'direction'] },
  { id: 'double-consonant', grade: '4', name: 'Double letters', emoji: '🪞', rule: 'Listen for the short vowel — it is often followed by a double letter.',
    words: ['dinner', 'letter', 'better', 'summer', 'happen', 'rabbit', 'sudden', 'traffic'] },
  { id: 'greek-latin', grade: '5', name: 'Word parts', emoji: '🏛️', rule: 'Learn the root and you can spell a whole family of words.',
    words: ['telephone', 'photograph', 'transport', 'microscope', 'geography', 'autograph', 'biology', 'signature'] },
];

export const SPELLING_SESSION_SIZE = 8;

const store = createScopedStore<SrsCollection>({
  key: 'spelling',
  docType: 'spelling',
  empty: () => ({}),
  parse: parseSrsCollection,
});

/** Patterns at or below a grade, easiest first. */
export function patternsForGrade(grade: GradeCode): SpellingPattern[] {
  const max = gradeIndex(grade);
  const list = SPELLING_PATTERNS.filter((pattern) => gradeIndex(pattern.grade) <= max);
  return list.length > 0 ? list : [SPELLING_PATTERNS[0]];
}

/** Look up which pattern a word belongs to. */
export function patternForWord(word: string): SpellingPattern | undefined {
  const target = word.toLowerCase();
  return SPELLING_PATTERNS.find((pattern) => pattern.words.some((w) => w.toLowerCase() === target));
}

export function spellingWordsForGrade(grade: GradeCode): string[] {
  return patternsForGrade(grade).flatMap((pattern) => pattern.words);
}

/** Words from one pattern only — used when a child picks a specific rule. */
export function spellingWordsForPattern(patternId: string): string[] {
  return SPELLING_PATTERNS.find((pattern) => pattern.id === patternId)?.words ?? [];
}

export interface SpellingCheck {
  correct: boolean;
  /** The child's answer, trimmed and lower-cased. */
  normalized: string;
  /** Index of the first letter that differs, or -1 when the word is correct. */
  firstDivergence: number;
  /** Child-facing feedback naming the pattern when one applies. */
  hint: string;
  /** True when the only problem is letter case. */
  caseOnly: boolean;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[‘’]/g, "'");
}

/**
 * Compare a typed attempt against the dictated word.
 *
 * Case and surrounding whitespace are forgiven — a six-year-old typing "Cat"
 * has spelled the word. Everything else is a miss, but the hint points at the
 * first wrong letter so the correction is specific.
 */
export function checkSpelling(expected: string, attempt: string): SpellingCheck {
  const target = normalize(expected);
  const normalized = normalize(attempt);
  const caseOnly = attempt.trim() !== expected && normalized === target;

  if (normalized === target) {
    return { correct: true, normalized, firstDivergence: -1, hint: 'Spelled perfectly!', caseOnly };
  }

  let firstDivergence = 0;
  while (
    firstDivergence < normalized.length &&
    firstDivergence < target.length &&
    normalized[firstDivergence] === target[firstDivergence]
  ) {
    firstDivergence += 1;
  }

  const pattern = patternForWord(expected);
  const shared = target.slice(0, firstDivergence);
  const positional = normalized.length === 0
    ? `Have a go — the word starts with "${target[0]}".`
    : shared.length > 0
      ? `You had "${shared}" right — check the next letter.`
      : 'Check the very first sound.';

  return {
    correct: false,
    normalized,
    firstDivergence,
    hint: pattern ? `${positional} ${pattern.rule}` : positional,
    caseOnly,
  };
}

export function loadSpellingProgress(uid: string | null | undefined): Promise<SrsCollection> {
  return store.load(uid);
}

export function loadSpellingProgressLocal(uid: string | null | undefined): SrsCollection {
  return store.readLocal(uid);
}

export function buildSpellingSession(
  collection: SrsCollection,
  grade: GradeCode,
  size = SPELLING_SESSION_SIZE,
  now: Date = new Date(),
  patternId?: string,
): string[] {
  const candidates = patternId ? spellingWordsForPattern(patternId) : spellingWordsForGrade(grade);
  return buildReviewQueue({ collection, candidateIds: candidates, limit: size, now });
}

export async function recordSpellingWord(
  uid: string | null | undefined,
  word: string,
  correct: boolean,
  now: Date = new Date(),
): Promise<SrsCollection> {
  return store.update(uid, (collection) => recordSrsReview(collection, word, correct, now));
}

export interface SpellingProgress extends SrsSummary {
  patterns: Array<{ pattern: SpellingPattern; mastered: number; total: number; percent: number }>;
}

export function spellingProgress(
  collection: SrsCollection,
  grade: GradeCode,
  now: Date = new Date(),
): SpellingProgress {
  return {
    ...summarizeSrs(collection, now),
    patterns: patternsForGrade(grade).map((pattern) => {
      const mastered = pattern.words.filter((word) => (collection[word]?.box ?? 0) >= 4).length;
      return {
        pattern,
        mastered,
        total: pattern.words.length,
        percent: pattern.words.length === 0 ? 0 : Math.round((mastered / pattern.words.length) * 100),
      };
    }),
  };
}
