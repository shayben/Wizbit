import { describe, it, expect, beforeEach, vi } from 'vitest';

const api = vi.hoisted(() => ({ apiPost: vi.fn() }));
vi.mock('../services/apiClient', () => ({
  apiPost: api.apiPost,
  QuotaExceededError: class extends Error {},
}));

import {
  QUESTION_KIND_META,
  buildOfflineComprehension,
  contentWords,
  extractKeyIdeas,
  generateComprehension,
  questionCountForGrade,
  scoreComprehension,
  scoreRetell,
  splitSentences,
  type ComprehensionQuestion,
} from '../services/comprehensionService';

const PASSAGE =
  'Maya found a small turtle by the pond. The turtle had a cracked shell. ' +
  'Maya carried the turtle to the animal rescue. The vet said the turtle would heal.';

beforeEach(() => {
  api.apiPost.mockReset();
});

describe('splitSentences', () => {
  it('splits on sentence-ending punctuation', () => {
    expect(splitSentences('One. Two! Three?')).toEqual(['One.', 'Two!', 'Three?']);
  });

  it('collapses whitespace and drops empties', () => {
    expect(splitSentences('  A.\n\n  B.  ')).toEqual(['A.', 'B.']);
  });

  it('returns an empty list for blank text', () => {
    expect(splitSentences('   ')).toEqual([]);
  });
});

describe('contentWords', () => {
  it('drops stop words and short words', () => {
    const words = contentWords('The cat is on the big mat with a turtle');
    expect(words).toContain('turtle');
    expect(words).not.toContain('the');
    expect(words).not.toContain('is');
    expect(words).not.toContain('cat'); // under the 4-letter threshold
  });

  it('orders by frequency', () => {
    expect(contentWords('turtle turtle turtle pond')[0]).toBe('turtle');
  });

  it('is case-insensitive', () => {
    expect(contentWords('Turtle turtle')).toEqual(['turtle']);
  });

  it('returns an empty list when there is no content', () => {
    expect(contentWords('the a of it')).toEqual([]);
  });
});

describe('questionCountForGrade', () => {
  it('asks a first grader fewer questions than a third grader', () => {
    expect(questionCountForGrade('1')).toBeLessThan(questionCountForGrade('3'));
  });
});

describe('buildOfflineComprehension', () => {
  it('produces answerable questions without any network call', () => {
    const set = buildOfflineComprehension(PASSAGE, '3');
    expect(set.offline).toBe(true);
    expect(set.questions.length).toBeGreaterThan(0);
    for (const q of set.questions) {
      expect(q.choices.length).toBeGreaterThanOrEqual(2);
      expect(q.answerIndex).toBeGreaterThanOrEqual(0);
      expect(q.answerIndex).toBeLessThan(q.choices.length);
      expect(q.explanation.length).toBeGreaterThan(0);
    }
  });

  it('marks the true opening sentence as the correct answer', () => {
    const set = buildOfflineComprehension(PASSAGE, '3');
    const first = set.questions.find((q) => q.id === 'cq_offline_first');
    expect(first!.choices[first!.answerIndex]).toBe(splitSentences(PASSAGE)[0]);
  });

  it('never offers duplicate choices for a question', () => {
    for (const q of buildOfflineComprehension(PASSAGE, '3').questions) {
      expect(new Set(q.choices).size).toBe(q.choices.length);
    }
  });

  it('respects the per-grade question count', () => {
    expect(buildOfflineComprehension(PASSAGE, '1').questions.length)
      .toBeLessThanOrEqual(questionCountForGrade('1'));
  });

  it('degrades gracefully on a one-sentence passage', () => {
    const set = buildOfflineComprehension('A dog ran.', '1');
    expect(Array.isArray(set.questions)).toBe(true);
    expect(set.keyIdeas.length).toBeGreaterThan(0);
  });
});

describe('extractKeyIdeas', () => {
  it('returns the leading sentences, capped', () => {
    expect(extractKeyIdeas(PASSAGE, 2)).toEqual(splitSentences(PASSAGE).slice(0, 2));
  });
});

describe('generateComprehension', () => {
  it('uses model output when it is well-formed', async () => {
    api.apiPost.mockResolvedValue({
      content: JSON.stringify({
        questions: [{
          kind: 'literal',
          prompt: 'Where did Maya find the turtle?',
          choices: ['By the pond', 'In a tree', 'At school'],
          answerIndex: 0,
          explanation: 'The first sentence says by the pond.',
        }],
        keyIdeas: ['Maya found a turtle'],
      }),
    });

    const set = await generateComprehension(PASSAGE, '3');
    expect(set.offline).toBe(false);
    expect(set.questions).toHaveLength(1);
    expect(set.questions[0].prompt).toContain('Where did Maya');
    expect(set.keyIdeas).toEqual(['Maya found a turtle']);
  });

  it('charges the learning-activity quota bucket', async () => {
    api.apiPost.mockResolvedValue({ content: '{"questions":[],"keyIdeas":[]}' });
    await generateComprehension(PASSAGE, '3');
    expect(api.apiPost).toHaveBeenCalledWith(
      '/openai/chat',
      expect.objectContaining({ purpose: 'learning-activity' }),
    );
  });

  it('tolerates markdown fences around the JSON', async () => {
    api.apiPost.mockResolvedValue({
      content: '```json\n{"questions":[{"kind":"literal","prompt":"Q?","choices":["a","b"],"answerIndex":1,"explanation":""}],"keyIdeas":[]}\n```',
    });
    const set = await generateComprehension(PASSAGE, '3');
    expect(set.offline).toBe(false);
    expect(set.questions[0].answerIndex).toBe(1);
  });

  it('falls back offline when the request fails', async () => {
    api.apiPost.mockRejectedValue(new Error('over quota'));
    const set = await generateComprehension(PASSAGE, '3');
    expect(set.offline).toBe(true);
    expect(set.questions.length).toBeGreaterThan(0);
  });

  it('falls back offline when the model returns unusable JSON', async () => {
    api.apiPost.mockResolvedValue({ content: 'sorry, I cannot do that' });
    expect((await generateComprehension(PASSAGE, '3')).offline).toBe(true);
  });

  it('discards questions whose answer index is out of range', async () => {
    api.apiPost.mockResolvedValue({
      content: JSON.stringify({
        questions: [
          { kind: 'literal', prompt: 'Bad', choices: ['a', 'b'], answerIndex: 9, explanation: '' },
          { kind: 'literal', prompt: 'Good', choices: ['a', 'b'], answerIndex: 0, explanation: '' },
        ],
        keyIdeas: ['x'],
      }),
    });
    const set = await generateComprehension(PASSAGE, '3');
    expect(set.questions.map((q) => q.prompt)).toEqual(['Good']);
  });

  it('fills a missing explanation with the question-kind hint', async () => {
    api.apiPost.mockResolvedValue({
      content: JSON.stringify({
        questions: [{ kind: 'inferential', prompt: 'Q?', choices: ['a', 'b'], answerIndex: 0, explanation: '' }],
        keyIdeas: [],
      }),
    });
    const set = await generateComprehension(PASSAGE, '3');
    expect(set.questions[0].explanation).toBe(QUESTION_KIND_META.inferential.hint);
  });

  it('returns an empty set for blank text without calling the API', async () => {
    const set = await generateComprehension('   ', '3');
    expect(set.questions).toEqual([]);
    expect(api.apiPost).not.toHaveBeenCalled();
  });
});

describe('scoreRetell', () => {
  const ideas = ['Maya found a small turtle by the pond.', 'The vet said the turtle would heal.'];

  it('credits a retell that uses the child’s own wording', () => {
    const score = scoreRetell('A girl named Maya saw a turtle near the pond water', ideas);
    expect(score.covered).toContain(ideas[0]);
    expect(score.coverage).toBeGreaterThan(0);
  });

  it('reaches full coverage when every idea is mentioned', () => {
    const score = scoreRetell(
      'Maya found a small turtle near the pond. The vet said the turtle would heal soon.',
      ideas,
    );
    expect(score.coverage).toBe(100);
    expect(score.missed).toEqual([]);
  });

  it('lists the ideas the child left out', () => {
    const score = scoreRetell('Maya found a turtle by the pond', ideas);
    expect(score.missed).toContain(ideas[1]);
  });

  it('handles an empty retell with a nudge rather than a score', () => {
    const score = scoreRetell('', ideas);
    expect(score.coverage).toBe(0);
    expect(score.wordCount).toBe(0);
    expect(score.label).toBe('Nothing recorded');
  });

  it('does not credit an unrelated retell', () => {
    expect(scoreRetell('I ate pizza and played soccer outside', ideas).coverage).toBe(0);
  });

  it('returns zero coverage when there are no key ideas to score', () => {
    expect(scoreRetell('anything at all', []).coverage).toBe(0);
  });

  it('counts the words the child actually said', () => {
    expect(scoreRetell('one two three', ideas).wordCount).toBe(3);
  });
});

describe('scoreComprehension', () => {
  const questions: ComprehensionQuestion[] = [
    { id: 'a', kind: 'literal', prompt: '', choices: ['x', 'y'], answerIndex: 0, explanation: '' },
    { id: 'b', kind: 'literal', prompt: '', choices: ['x', 'y'], answerIndex: 1, explanation: '' },
  ];

  it('scores a perfect set', () => {
    expect(scoreComprehension(questions, { a: 0, b: 1 })).toEqual({ correct: 2, total: 2, percent: 100 });
  });

  it('scores a partial set', () => {
    expect(scoreComprehension(questions, { a: 0, b: 0 }).percent).toBe(50);
  });

  it('treats unanswered questions as wrong', () => {
    expect(scoreComprehension(questions, {}).correct).toBe(0);
  });

  it('avoids dividing by zero for an empty set', () => {
    expect(scoreComprehension([], {})).toEqual({ correct: 0, total: 0, percent: 0 });
  });
});
