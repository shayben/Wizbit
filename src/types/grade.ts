/**
 * Shared grade vocabulary.
 *
 * Reading levels, math skills, sight-word tiers, spelling lists and word
 * problems are all indexed by the same grade code so a child profile's grade
 * can drive every learning area from a single value.
 */

export type GradeCode = 'K' | '1' | '2' | '3' | '4' | '5';

export const GRADE_CODES: GradeCode[] = ['K', '1', '2', '3', '4', '5'];

export interface GradeMeta {
  grade: GradeCode;
  label: string;
  emoji: string;
}

export const GRADES: GradeMeta[] = [
  { grade: 'K', label: 'Kindergarten', emoji: '🐣' },
  { grade: '1', label: 'Grade 1', emoji: '🌱' },
  { grade: '2', label: 'Grade 2', emoji: '🌿' },
  { grade: '3', label: 'Grade 3', emoji: '🌳' },
  { grade: '4', label: 'Grade 4', emoji: '🚀' },
  { grade: '5', label: 'Grade 5', emoji: '🏔️' },
];

const GRADE_META = new Map(GRADES.map((g) => [g.grade, g]));

export function gradeMeta(grade: GradeCode): GradeMeta {
  return GRADE_META.get(grade) ?? GRADES[0];
}

export function isGradeCode(value: unknown): value is GradeCode {
  return typeof value === 'string' && (GRADE_CODES as string[]).includes(value);
}

/** Numeric index of a grade (K = 0) — useful for ordering and comparisons. */
export function gradeIndex(grade: GradeCode): number {
  return GRADE_CODES.indexOf(grade);
}

/** Clamp a numeric grade index back to a valid grade code. */
export function gradeFromIndex(index: number): GradeCode {
  return GRADE_CODES[Math.max(0, Math.min(GRADE_CODES.length - 1, index))];
}
