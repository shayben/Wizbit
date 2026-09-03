import { isCosmosConfigured, queryDocuments, upsertDocument } from './cosmosService';

export type MathGrade = 'K' | '1' | '2' | '3' | '4' | '5';

export interface MathSkill {
  id: string;
  grade: MathGrade;
  name: string;
  description: string;
  emoji: string;
  strategy: string;
}

export interface MathQuestion {
  id: string;
  prompt: string;
  answer: number;
  tip: string;
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

export interface MathBuddy {
  id: string;
  name: string;
  emoji: string;
  requiredCorrect: number;
}

export type MathMasteryStatus = 'new' | 'developing' | 'mastered';

export interface MathSkillProgress {
  skillId: string;
  attempts: number;
  accuracy: number;
  status: MathMasteryStatus;
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
  { id: 'count-next', grade: 'K', name: 'Counting', description: 'Find the next number up to 20', emoji: '🔢', strategy: 'Say the counting numbers in order and stop one number after the number shown.' },
  { id: 'shapes-sides', grade: 'K', name: 'Shape Sides', description: 'Count the sides of familiar shapes', emoji: '🔺', strategy: 'Trace around the shape and count each straight side once.' },
  { id: 'add-5', grade: 'K', name: 'Add to 5', description: 'Put small groups together', emoji: '➕', strategy: 'Start with the bigger group, then count on the smaller group.' },
  { id: 'add-20', grade: '1', name: 'Addition', description: 'Add numbers within 20', emoji: '➕', strategy: 'Start with the bigger number and count on; make a group of 10 when you can.' },
  { id: 'subtract-20', grade: '1', name: 'Subtraction', description: 'Subtract numbers within 20', emoji: '➖', strategy: 'Start at the first number and count back the amount being taken away.' },
  { id: 'compare-20', grade: '1', name: 'Compare Numbers', description: 'Find the greater number within 20', emoji: '⚖️', strategy: 'The number farther along on a number line is greater.' },
  { id: 'place-value', grade: '2', name: 'Place Value', description: 'Find the value of a tens digit', emoji: '🏠', strategy: 'A digit in the tens place means that many groups of 10.' },
  { id: 'add-100', grade: '2', name: 'Addition to 100', description: 'Add one- and two-digit numbers', emoji: '➕', strategy: 'Line up ones with ones and tens with tens, then add each place.' },
  { id: 'subtract-100', grade: '2', name: 'Subtraction to 100', description: 'Subtract within 100', emoji: '➖', strategy: 'Line up place values and subtract ones before tens, regrouping one ten if needed.' },
  { id: 'multiply-10', grade: '3', name: 'Times Tables', description: 'Practice multiplication facts to 10 × 10', emoji: '✖️', strategy: 'Think of multiplication as equal groups or skip-count by one factor.' },
  { id: 'divide-10', grade: '3', name: 'Division Facts', description: 'Practice division using times tables', emoji: '➗', strategy: 'Ask which multiplication fact uses the divisor to make the total.' },
  { id: 'fraction-whole', grade: '3', name: 'Fraction Wholes', description: 'Build a whole from equal parts', emoji: '🍕', strategy: 'The denominator names how many equal parts make one whole.' },
  { id: 'multiply-multi', grade: '4', name: 'Multi-digit Multiplication', description: 'Multiply larger numbers', emoji: '✖️', strategy: 'Break the larger number into tens and ones, multiply each part, then add.' },
  { id: 'divide-12', grade: '4', name: 'Division', description: 'Divide evenly by numbers up to 12', emoji: '➗', strategy: 'Use the related multiplication fact: divisor × quotient = total.' },
  { id: 'perimeter', grade: '4', name: 'Perimeter', description: 'Find the distance around rectangles', emoji: '📐', strategy: 'Perimeter is the distance around a shape; add all sides, or double length plus width.' },
  { id: 'decimal-add', grade: '5', name: 'Decimal Addition', description: 'Add numbers with tenths', emoji: '🔟', strategy: 'Line up decimal points so each place value stays in the correct column.' },
  { id: 'fraction-add', grade: '5', name: 'Add Fractions', description: 'Add fractions with like denominators', emoji: '🥧', strategy: 'When denominators match, add the numerators and keep the denominator.' },
  { id: 'order-operations', grade: '5', name: 'Order of Operations', description: 'Multiply before adding or subtracting', emoji: '🧠', strategy: 'Do multiplication and division before addition and subtraction.' },
];

export const MATH_BUDDIES: MathBuddy[] = [
  { id: 'pixel', name: 'Pixel the Fox', emoji: '🦊', requiredCorrect: 3 },
  { id: 'nova', name: 'Nova the Dragon', emoji: '🐉', requiredCorrect: 6 },
  { id: 'cosmo', name: 'Cosmo the Unicorn', emoji: '🦄', requiredCorrect: 10 },
];

const LS_MATH_SESSIONS = (uid: string) => `ra_math_sessions_${uid}`;
const LS_MATH_BUDDIES = (uid: string) => `ra_math_buddies_${uid}`;

export function getUnlockedMathBuddyIds(uid: string | null | undefined): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(LS_MATH_BUDDIES(uid || 'anon')) ?? '[]');
    return Array.isArray(stored)
      ? stored.filter((id): id is string => typeof id === 'string' && MATH_BUDDIES.some((buddy) => buddy.id === id))
      : [];
  } catch {
    return [];
  }
}

export function unlockMathBuddy(uid: string | null | undefined, buddyId: string): void {
  if (!MATH_BUDDIES.some((buddy) => buddy.id === buddyId)) return;
  const unlockedIds = getUnlockedMathBuddyIds(uid);
  if (unlockedIds.includes(buddyId)) return;
  try {
    localStorage.setItem(LS_MATH_BUDDIES(uid || 'anon'), JSON.stringify([...unlockedIds, buddyId]));
  } catch { /* localStorage unavailable or full */ }
}

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
    case 'shapes-sides': {
      const shapes = [
        { name: 'triangle', sides: 3 },
        { name: 'square', sides: 4 },
        { name: 'rectangle', sides: 4 },
        { name: 'pentagon', sides: 5 },
      ];
      const shape = shapes[randomInt(0, shapes.length - 1, random)];
      prompt = `How many sides does a ${shape.name} have?`;
      answer = shape.sides;
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
    case 'compare-20': {
      const first = randomInt(0, 19, random);
      const second = randomInt(first + 1, 20, random);
      prompt = `Which number is greater: ${first} or ${second}?`;
      answer = second;
      break;
    }
    case 'place-value': {
      const tens = randomInt(1, 9, random);
      const ones = randomInt(0, 9, random);
      prompt = `What is the value of the tens digit in ${tens}${ones}?`;
      answer = tens * 10;
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
    case 'fraction-whole': {
      const denominator = randomInt(2, 8, random);
      prompt = `How many 1/${denominator} parts make one whole?`;
      answer = denominator;
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
    case 'perimeter': {
      const length = randomInt(2, 12, random);
      const width = randomInt(2, 12, random);
      prompt = `A rectangle is ${length} by ${width}. What is its perimeter?`;
      answer = 2 * (length + width);
      break;
    }
    case 'decimal-add': {
      const firstTenths = randomInt(1, 99, random);
      const secondTenths = randomInt(1, 99, random);
      prompt = `${(firstTenths / 10).toFixed(1)} + ${(secondTenths / 10).toFixed(1)} = ?`;
      answer = (firstTenths + secondTenths) / 10;
      break;
    }
    case 'fraction-add': {
      const denominator = randomInt(2, 10, random);
      const first = randomInt(1, denominator - 1, random);
      const second = randomInt(1, denominator - 1, random);
      prompt = `${first}/${denominator} + ${second}/${denominator} = ? (enter a decimal)`;
      answer = (first + second) / denominator;
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

  const skill = MATH_SKILLS.find((item) => item.id === skillId);
  return { id: `${skillId}-${index}`, prompt, answer, tip: skill?.strategy ?? 'Break the problem into smaller steps and check your work.' };
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

export function getMathSkillProgress(skillId: string, sessions: MathSessionRecord[]): MathSkillProgress {
  const attempts = sessions
    .filter((session) => session.skillId === skillId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 3);
  const accuracy = attempts.length === 0
    ? 0
    : Math.round(attempts.reduce((sum, session) => sum + session.accuracy, 0) / attempts.length);
  return {
    skillId,
    attempts: attempts.length,
    accuracy,
    status: attempts.length === 0 ? 'new' : accuracy >= 80 ? 'mastered' : 'developing',
  };
}

export function recommendMathSkill(grade: MathGrade, sessions: MathSessionRecord[]): MathSkill {
  const gradeSkills = MATH_SKILLS.filter((skill) => skill.grade === grade);
  const latest = sessions
    .filter((session) => session.grade === grade)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  if (!latest) return gradeSkills[0];

  const currentIndex = Math.max(0, gradeSkills.findIndex((skill) => skill.id === latest.skillId));
  const progress = getMathSkillProgress(latest.skillId, sessions);
  if (progress.accuracy >= 80) return gradeSkills[Math.min(currentIndex + 1, gradeSkills.length - 1)];
  if (progress.accuracy < 50) return gradeSkills[Math.max(currentIndex - 1, 0)];
  return gradeSkills[currentIndex];
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
