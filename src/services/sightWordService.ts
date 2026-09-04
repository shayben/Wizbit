/**
 * Sight words (Fry high-frequency words).
 *
 * Roughly half the words in any elementary text come from the Fry first 300.
 * A first grader who has to decode "because" every single time has no
 * attention left for meaning, so automaticity on this list is the highest-
 * value fluency work at that age. Third graders use the later tiers to shore
 * up the words that still slow them down.
 *
 * Scheduling is delegated to {@link ./srsService}; this module owns the word
 * list, the grade→tier mapping, and per-learner persistence.
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

export interface SightWordTier {
  id: string;
  label: string;
  /** Lowest grade for which this tier is on-level. */
  grade: GradeCode;
  words: string[];
}

/** Fry high-frequency words, in frequency order, grouped into teachable tiers. */
export const SIGHT_WORD_TIERS: SightWordTier[] = [
  {
    id: 'fry-1',
    label: 'First 25',
    grade: 'K',
    words: ['the', 'of', 'and', 'a', 'to', 'in', 'is', 'you', 'that', 'it', 'he', 'was', 'for',
      'on', 'are', 'as', 'with', 'his', 'they', 'I', 'at', 'be', 'this', 'have', 'from'],
  },
  {
    id: 'fry-2',
    label: 'Words 26–50',
    grade: 'K',
    words: ['or', 'one', 'had', 'by', 'words', 'but', 'not', 'what', 'all', 'were', 'we', 'when',
      'your', 'can', 'said', 'there', 'use', 'an', 'each', 'which', 'she', 'do', 'how', 'their', 'if'],
  },
  {
    id: 'fry-3',
    label: 'Words 51–75',
    grade: '1',
    words: ['will', 'up', 'other', 'about', 'out', 'many', 'then', 'them', 'these', 'so', 'some',
      'her', 'would', 'make', 'like', 'him', 'into', 'time', 'has', 'look', 'two', 'more', 'write', 'go', 'see'],
  },
  {
    id: 'fry-4',
    label: 'Words 76–100',
    grade: '1',
    words: ['number', 'no', 'way', 'could', 'people', 'my', 'than', 'first', 'water', 'been',
      'call', 'who', 'oil', 'its', 'now', 'find', 'long', 'down', 'day', 'did', 'get', 'come', 'made', 'may', 'part'],
  },
  {
    id: 'fry-5',
    label: 'Words 101–150',
    grade: '2',
    words: ['over', 'new', 'sound', 'take', 'only', 'little', 'work', 'know', 'place', 'year',
      'live', 'me', 'back', 'give', 'most', 'very', 'after', 'thing', 'our', 'just', 'name', 'good',
      'sentence', 'man', 'think', 'say', 'great', 'where', 'help', 'through', 'much', 'before', 'line',
      'right', 'too', 'means', 'old', 'any', 'same', 'tell', 'boy', 'follow', 'came', 'want', 'show',
      'also', 'around', 'form', 'three', 'small'],
  },
  {
    id: 'fry-6',
    label: 'Words 151–200',
    grade: '2',
    words: ['set', 'put', 'end', 'does', 'another', 'well', 'large', 'must', 'big', 'even', 'such',
      'because', 'turn', 'here', 'why', 'asked', 'went', 'men', 'read', 'need', 'land', 'different',
      'home', 'us', 'move', 'try', 'kind', 'hand', 'picture', 'again', 'change', 'off', 'play', 'spell',
      'air', 'away', 'animal', 'house', 'point', 'page', 'letter', 'mother', 'answer', 'found', 'study',
      'still', 'learn', 'should', 'world', 'high'],
  },
  {
    id: 'fry-7',
    label: 'Words 201–250',
    grade: '3',
    words: ['every', 'near', 'add', 'food', 'between', 'own', 'below', 'country', 'plant', 'last',
      'school', 'father', 'keep', 'tree', 'never', 'start', 'city', 'earth', 'eyes', 'light', 'thought',
      'head', 'under', 'story', 'saw', 'left', 'few', 'while', 'along', 'might', 'close', 'something',
      'seem', 'next', 'hard', 'open', 'example', 'begin', 'life', 'always', 'those', 'both', 'paper',
      'together', 'got', 'group', 'often', 'run', 'important', 'until'],
  },
  {
    id: 'fry-8',
    label: 'Words 251–300',
    grade: '3',
    words: ['children', 'side', 'feet', 'car', 'mile', 'night', 'walk', 'white', 'sea', 'began',
      'grow', 'took', 'river', 'four', 'carry', 'state', 'once', 'book', 'hear', 'stop', 'without',
      'second', 'later', 'miss', 'idea', 'enough', 'eat', 'face', 'watch', 'far', 'really', 'almost',
      'let', 'above', 'girl', 'sometimes', 'mountain', 'cut', 'young', 'talk', 'soon', 'list', 'song',
      'being', 'leave', 'family', 'body', 'music', 'color', 'stand'],
  },
];

/** Default number of words in one sight-word drill. */
export const SIGHT_WORD_SESSION_SIZE = 10;

const store = createScopedStore<SrsCollection>({
  key: 'sight_words',
  docType: 'sightWords',
  empty: () => ({}),
  parse: parseSrsCollection,
});

/**
 * Tiers appropriate for a grade: everything up to and including the child's
 * own level, so a third grader still gets credit for (and review of) the
 * earlier words rather than starting from scratch.
 */
export function tiersForGrade(grade: GradeCode): SightWordTier[] {
  const max = gradeIndex(grade);
  const onLevel = SIGHT_WORD_TIERS.filter((tier) => gradeIndex(tier.grade) <= max);
  return onLevel.length > 0 ? onLevel : [SIGHT_WORD_TIERS[0]];
}

/** Every candidate word for a grade, easiest tier first. */
export function wordsForGrade(grade: GradeCode): string[] {
  return tiersForGrade(grade).flatMap((tier) => tier.words);
}

export function loadSightWordProgress(uid: string | null | undefined): Promise<SrsCollection> {
  return store.load(uid);
}

export function loadSightWordProgressLocal(uid: string | null | undefined): SrsCollection {
  return store.readLocal(uid);
}

export function saveSightWordProgress(
  uid: string | null | undefined,
  collection: SrsCollection,
): Promise<void> {
  return store.save(uid, collection);
}

/** Build the next drill: due words first, then a capped number of new ones. */
export function buildSightWordSession(
  collection: SrsCollection,
  grade: GradeCode,
  size = SIGHT_WORD_SESSION_SIZE,
  now: Date = new Date(),
): string[] {
  return buildReviewQueue({
    collection,
    candidateIds: wordsForGrade(grade),
    limit: size,
    now,
  });
}

/** Record one word's outcome and persist. Returns the updated collection. */
export async function recordSightWord(
  uid: string | null | undefined,
  word: string,
  correct: boolean,
  now: Date = new Date(),
): Promise<SrsCollection> {
  return store.update(uid, (collection) => recordSrsReview(collection, word, correct, now));
}

export interface SightWordProgress extends SrsSummary {
  /** Total words available at this grade. */
  available: number;
  /** Percentage of the grade's list mastered, 0–100. */
  listPercent: number;
  /** Per-tier mastery, for the progress display. */
  tiers: Array<{ tier: SightWordTier; mastered: number; total: number; percent: number }>;
}

export function sightWordProgress(
  collection: SrsCollection,
  grade: GradeCode,
  now: Date = new Date(),
): SightWordProgress {
  const tiers = tiersForGrade(grade);
  const available = tiers.reduce((sum, tier) => sum + tier.words.length, 0);
  const summary = summarizeSrs(collection, now);

  const tierRows = tiers.map((tier) => {
    const mastered = tier.words.filter((word) => (collection[word]?.box ?? 0) >= 4).length;
    return {
      tier,
      mastered,
      total: tier.words.length,
      percent: tier.words.length === 0 ? 0 : Math.round((mastered / tier.words.length) * 100),
    };
  });

  const masteredInGrade = tierRows.reduce((sum, row) => sum + row.mastered, 0);

  return {
    ...summary,
    available,
    listPercent: available === 0 ? 0 : Math.round((masteredInGrade / available) * 100),
    tiers: tierRows,
  };
}
