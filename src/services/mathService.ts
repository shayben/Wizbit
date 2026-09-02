import { isCosmosConfigured, queryDocuments, upsertDocument } from './cosmosService';

export type MathGrade = 'K' | '1' | '2' | '3' | '4' | '5';

export interface MathSkill {
  id: string;
  grade: MathGrade;
  name: string;
  description: string;
  emoji: string;
}

export interface MathQuestion {
  id: string;
  prompt: string;
  answer: number;
}

export interface MathResponse {
  question: string;
  expectedAnswer: number;
  studentAnswer: number;
  correct: boolean;
  responseMs: number;
}

export interface MathSessionRecord {
  id: string;
  date: string;
  grade: MathGrade;
  skillId: string;
  skillName: string;
  accuracy: number;
  correctCount: number;
  questionCount: number;
  averageResponseMs: number;
  responses: MathResponse[];
}

export interface MathProgressSummary {
  sessionCount: number;
  questionsAnswered: number;
  correctAnswers: number;
  accuracy: number;
  averageResponseMs: number;
}

export const MATH_GRADES: Array<{ grade: MathGrade; label: string; emoji: string }> = [
  { grade: 'K', label: 'Kindergarten', emoji: '🐣' },
  { grade: '1', label: 'Grade 1', emoji: '🌱' },
  { grade: '2', label: 'Grade 2', emoji: '🌿' },
  { grade: '3', label: 'Grade 3', emoji: '🌳' },
  { grade: '4', label: 'Grade 4', emoji: '🚀' },
  { grade: '5', label: 'Grade 5', emoji: '🏔️' },
];

export const MATH_SKILLS: MathSkill[] = [
  { id: 'count-next', grade: 'K', name: 'Counting', description: 'Find the next number up to 20', emoji: '🔢' },
  { id: 'add-5', grade: 'K', name: 'Add to 5', description: 'Put small groups together', emoji: '➕' },
  { id: 'add-20', grade: '1', name: 'Addition', description: 'Add numbers within 20', emoji: '➕' },
  { id: 'subtract-20', grade: '1', name: 'Subtraction', description: 'Subtract numbers within 20', emoji: '➖' },
  { id: 'add-100', grade: '2', name: 'Addition to 100', description: 'Add one- and two-digit numbers', emoji: '➕' },
  { id: 'subtract-100', grade: '2', name: 'Subtraction to 100', description: 'Subtract within 100', emoji: '➖' },
  { id: 'multiply-10', grade: '3', name: 'Times Tables', description: 'Practice multiplication facts to 10 × 10', emoji: '✖️' },
  { id: 'divide-10', grade: '3', name: 'Division Facts', description: 'Practice division using times tables', emoji: '➗' },
  { id: 'multiply-multi', grade: '4', name: 'Multi-digit Multiplication', description: 'Multiply larger numbers', emoji: '✖️' },
  { id: 'divide-12', grade: '4', name: 'Division', description: 'Divide evenly by numbers up to 12', emoji: '➗' },
  { id: 'decimal-add', grade: '5', name: 'Decimal Addition', description: 'Add numbers with tenths', emoji: '🔟' },
  { id: 'order-operations', grade: '5', name: 'Order of Operations', description: 'Multiply before adding or subtracting', emoji: '🧠' },
];

const LS_MATH_SESSIONS = (uid: string) => `ra_math_sessions_${uid}`;

function randomInt(min: number, max: number, random: () => number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function createQuestion(skillId: string, index: number, random: () => number): MathQuestion {
  let prompt: string;
  let answer: number;

  switch (skillId) {
    case 'count-next': {
      const value = randomInt(0, 19, random);
      prompt = `What number comes after ${value}?`;
      answer = value + 1;
      break;
    }
    case 'add-5': {
      const first = randomInt(0, 5, random);
      const second = randomInt(0, 5 - first, random);
      prompt = `${first} + ${second} = ?`;
      answer = first + second;
      break;
    }
    case 'add-20': {
      const first = randomInt(0, 20, random);
      const second = randomInt(0, 20 - first, random);
      prompt = `${first} + ${second} = ?`;
      answer = first + second;
      break;
    }
    case 'subtract-20': {
      const first = randomInt(0, 20, random);
      const second = randomInt(0, first, random);
      prompt = `${first} − ${second} = ?`;
      answer = first - second;
      break;
    }
    case 'add-100': {
      const first = randomInt(10, 89, random);
      const second = randomInt(1, 100 - first, random);
      prompt = `${first} + ${second} = ?`;
      answer = first + second;
      break;
    }
    case 'subtract-100': {
      const first = randomInt(10, 100, random);
      const second = randomInt(1, first, random);
      prompt = `${first} − ${second} = ?`;
      answer = first - second;
      break;
    }
    case 'multiply-10': {
      const first = randomInt(0, 10, random);
      const second = randomInt(0, 10, random);
      prompt = `${first} × ${second} = ?`;
      answer = first * second;
      break;
    }
    case 'divide-10': {
      const divisor = randomInt(1, 10, random);
      const quotient = randomInt(0, 10, random);
      prompt = `${divisor * quotient} ÷ ${divisor} = ?`;
      answer = quotient;
      break;
    }
    case 'multiply-multi': {
      const first = randomInt(10, 50, random);
      const second = randomInt(2, 12, random);
      prompt = `${first} × ${second} = ?`;
      answer = first * second;
      break;
    }
    case 'divide-12': {
      const divisor = randomInt(2, 12, random);
      const quotient = randomInt(2, 25, random);
      prompt = `${divisor * quotient} ÷ ${divisor} = ?`;
      answer = quotient;
      break;
    }
    case 'decimal-add': {
      const firstTenths = randomInt(1, 99, random);
      const secondTenths = randomInt(1, 99, random);
      prompt = `${(firstTenths / 10).toFixed(1)} + ${(secondTenths / 10).toFixed(1)} = ?`;
      answer = (firstTenths + secondTenths) / 10;
      break;
    }
    case 'order-operations': {
      const first = randomInt(1, 10, random);
      const second = randomInt(2, 10, random);
      const third = randomInt(2, 10, random);
      const subtract = random() < 0.5 && first >= second * third;
      prompt = `${first} ${subtract ? '−' : '+'} ${second} × ${third} = ?`;
      answer = subtract ? first - second * third : first + second * third;
      break;
    }
    default:
      throw new Error(`Unknown math skill: ${skillId}`);
  }

  return { id: `${skillId}-${index}`, prompt, answer };
}

export function generateMathQuestions(
  skillId: string,
  count = 10,
  random: () => number = Math.random,
): MathQuestion[] {
  const skill = MATH_SKILLS.find((item) => item.id === skillId);
  if (!skill) throw new Error(`Unknown math skill: ${skillId}`);
  return Array.from({ length: Math.max(1, count) }, (_, index) => createQuestion(skillId, index, random));
}

export function computeMathSummary(sessions: MathSessionRecord[]): MathProgressSummary {
  const questionsAnswered = sessions.reduce((sum, session) => sum + session.questionCount, 0);
  const correctAnswers = sessions.reduce((sum, session) => sum + session.correctCount, 0);
  const totalResponseMs = sessions.reduce(
    (sum, session) => sum + session.responses.reduce((responseSum, response) => responseSum + response.responseMs, 0),
    0,
  );

  return {
    sessionCount: sessions.length,
    questionsAnswered,
    correctAnswers,
    accuracy: questionsAnswered === 0 ? 0 : Math.round((correctAnswers / questionsAnswered) * 100),
    averageResponseMs: questionsAnswered === 0 ? 0 : Math.round(totalResponseMs / questionsAnswered),
  };
}

export async function saveMathSession(uid: string | null | undefined, record: MathSessionRecord): Promise<void> {
  const effectiveUid = uid || 'anon';
  try {
    const stored = JSON.parse(localStorage.getItem(LS_MATH_SESSIONS(effectiveUid)) ?? '[]') as MathSessionRecord[];
    localStorage.setItem(LS_MATH_SESSIONS(effectiveUid), JSON.stringify([record, ...stored].slice(0, 200)));
  } catch { /* localStorage unavailable or full */ }

  if (!uid || !isCosmosConfigured) return;
  try {
    await upsertDocument({ ...record, uid, type: 'mathSession' });
  } catch { /* non-fatal */ }
}

export async function loadMathSessions(uid: string | null | undefined): Promise<MathSessionRecord[]> {
  const effectiveUid = uid || 'anon';
  if (uid && isCosmosConfigured) {
    try {
      const records = await queryDocuments<MathSessionRecord>(
        `SELECT c.id, c.date, c.grade, c.skillId, c.skillName, c.accuracy,
                c.correctCount, c.questionCount, c.averageResponseMs, c.responses
         FROM c WHERE c.uid = @uid AND c.type = "mathSession"
         ORDER BY c.date DESC OFFSET 0 LIMIT 200`,
        [{ name: '@uid', value: uid }],
        uid,
      );
      localStorage.setItem(LS_MATH_SESSIONS(effectiveUid), JSON.stringify(records));
      return records;
    } catch { /* fall through */ }
  }

  try {
    return JSON.parse(localStorage.getItem(LS_MATH_SESSIONS(effectiveUid)) ?? '[]') as MathSessionRecord[];
  } catch {
    return [];
  }
}
