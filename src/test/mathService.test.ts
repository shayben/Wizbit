import { beforeEach, describe, expect, it } from 'vitest';
import {
  MATH_GRADES,
  MATH_SKILLS,
  computeMathSummary,
  generateMathQuestions,
  loadMathSessions,
  saveMathSession,
  type MathSessionRecord,
} from '../services/mathService';

function session(overrides: Partial<MathSessionRecord> = {}): MathSessionRecord {
  return {
    id: 'student_math_1',
    date: '2026-01-01T00:00:00.000Z',
    grade: '3',
    skillId: 'multiply-10',
    skillName: 'Times Tables',
    accuracy: 50,
    correctCount: 1,
    questionCount: 2,
    averageResponseMs: 1500,
    responses: [
      {
        question: '2 × 3 = ?',
        expectedAnswer: 6,
        studentAnswer: 6,
        correct: true,
        responseMs: 1000,
      },
      {
        question: '4 × 5 = ?',
        expectedAnswer: 20,
        studentAnswer: 18,
        correct: false,
        responseMs: 2000,
      },
    ],
    ...overrides,
  };
}

describe('math curriculum', () => {
  it('offers at least two skills for every K-5 grade', () => {
    expect(MATH_GRADES.map(({ grade }) => grade)).toEqual(['K', '1', '2', '3', '4', '5']);
    for (const { grade } of MATH_GRADES) {
      expect(MATH_SKILLS.filter((skill) => skill.grade === grade).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('generates answerable multiplication-table questions', () => {
    const questions = generateMathQuestions('multiply-10', 3, () => 0.5);

    expect(questions).toHaveLength(3);
    expect(questions[0]).toMatchObject({ prompt: '5 × 5 = ?', answer: 25 });
    expect(new Set(questions.map((question) => question.id)).size).toBe(3);
  });

  it('generates the requested number of questions for every skill', () => {
    for (const skill of MATH_SKILLS) {
      const questions = generateMathQuestions(skill.id, 4, () => 0.25);
      expect(questions).toHaveLength(4);
      expect(questions.every((question) => Number.isFinite(question.answer))).toBe(true);
    }
  });

  it('rejects unknown skills', () => {
    expect(() => generateMathQuestions('not-a-skill')).toThrow('Unknown math skill');
  });
});

describe('math progress', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('aggregates accuracy and response time across sessions', () => {
    const summary = computeMathSummary([
      session(),
      session({
        id: 'student_math_2',
        correctCount: 2,
        accuracy: 100,
        responses: [
          { question: '1 + 1 = ?', expectedAnswer: 2, studentAnswer: 2, correct: true, responseMs: 500 },
          { question: '2 + 2 = ?', expectedAnswer: 4, studentAnswer: 4, correct: true, responseMs: 500 },
        ],
      }),
    ]);

    expect(summary).toEqual({
      sessionCount: 2,
      questionsAnswered: 4,
      correctAnswers: 3,
      accuracy: 75,
      averageResponseMs: 1000,
    });
  });

  it('returns zeroed metrics without sessions', () => {
    expect(computeMathSummary([])).toEqual({
      sessionCount: 0,
      questionsAnswered: 0,
      correctAnswers: 0,
      accuracy: 0,
      averageResponseMs: 0,
    });
  });

  it('saves and loads anonymous response history locally', async () => {
    const record = session();

    await saveMathSession(undefined, record);

    await expect(loadMathSessions(undefined)).resolves.toEqual([record]);
  });
});
