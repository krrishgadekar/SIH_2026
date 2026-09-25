/** ICDR severity scale, as graded centrally (design doc §6.7). */
export const GRADE_LABELS = ['No DR', 'Mild NPDR', 'Moderate NPDR', 'Severe NPDR', 'Proliferative DR'] as const;

export function gradeLabel(grade: number | null | undefined): string | null {
  if (grade === null || grade === undefined || grade < 0 || grade > 4) return null;
  return GRADE_LABELS[grade];
}

/** Grade 2+ is referable under the ICDR convention this system uses. */
export function isReferable(grade: number | null | undefined): boolean {
  return grade !== null && grade !== undefined && grade >= 2;
}

/** Design doc §6.8 routing tiers. */
export const TIER_TEXT: Record<'A' | 'B' | 'C', string> = {
  A: 'TIER A · AUTO-CLEAR: high-confidence AI result, no ophthalmologist queue',
  B: 'TIER B · AI-ASSISTED REVIEW: an ophthalmologist confirms this result',
  C: 'TIER C · FULL MANUAL REVIEW: an ophthalmologist grades this image',
};
