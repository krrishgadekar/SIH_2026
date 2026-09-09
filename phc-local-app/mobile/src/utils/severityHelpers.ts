import { Colors } from '../theme';

/**
 * DR severity grade helpers.
 * Uses backend severity.level (0–4) and severity.code.
 */

export interface SeverityDisplay {
  grade: number;
  shortLabel: string;
  fullLabel: string;
  colour: string;
  backgroundColour: string;
  whatThisMeans: string;
  workerAdvice: string;
}

const SEVERITY_MAP: Record<number, SeverityDisplay> = {
  0: {
    grade: 0,
    shortLabel: 'No DR',
    fullLabel: 'No Diabetic Retinopathy',
    colour: Colors.success,
    backgroundColour: Colors.successLight,
    whatThisMeans:
      'No signs of diabetic retinopathy were found in this image. ' +
      'The blood vessels in the retina appear healthy.',
    workerAdvice: 'Advise the patient to continue annual screening and maintain good blood sugar control.',
  },
  1: {
    grade: 1,
    shortLabel: 'Mild NPDR',
    fullLabel: 'Mild Non-Proliferative Diabetic Retinopathy',
    colour: Colors.success,
    backgroundColour: Colors.successLight,
    whatThisMeans:
      'Early changes have been found in the blood vessels of the retina. ' +
      'These are small and not yet causing major problems, but need monitoring.',
    workerAdvice: 'Schedule follow-up in 12 months. Reinforce blood sugar and blood pressure management.',
  },
  2: {
    grade: 2,
    shortLabel: 'Moderate NPDR',
    fullLabel: 'Moderate Non-Proliferative Diabetic Retinopathy',
    colour: Colors.warning,
    backgroundColour: Colors.warningLight,
    whatThisMeans:
      'Moderate changes are visible in the retinal blood vessels. ' +
      'Some areas may not be receiving adequate blood supply. ' +
      'This stage needs specialist evaluation.',
    workerAdvice: 'Refer to district eye clinic within 4 weeks for ophthalmologist review.',
  },
  3: {
    grade: 3,
    shortLabel: 'Severe NPDR',
    fullLabel: 'Severe Non-Proliferative Diabetic Retinopathy',
    colour: Colors.danger,
    backgroundColour: Colors.dangerLight,
    whatThisMeans:
      'Significant damage to retinal blood vessels is present. ' +
      'There is a high risk of progression to vision loss without treatment. ' +
      'Urgent specialist review is needed.',
    workerAdvice: 'Refer urgently to eye specialist within 1–2 weeks.',
  },
  4: {
    grade: 4,
    shortLabel: 'PDR',
    fullLabel: 'Proliferative Diabetic Retinopathy',
    colour: '#7B1E1E',
    backgroundColour: '#FDECEA',
    whatThisMeans:
      'The most advanced stage of diabetic retinopathy. ' +
      'New, abnormal blood vessels are growing on the retina. ' +
      'This can lead to severe vision loss or blindness without immediate treatment.',
    workerAdvice: 'EMERGENCY referral — send to ophthalmologist immediately.',
  },
};

export function getSeverityDisplay(level: number): SeverityDisplay {
  return SEVERITY_MAP[level] ?? SEVERITY_MAP[0];
}

export function getPriorityColour(priority: string): string {
  switch (priority.toUpperCase()) {
    case 'EMERGENCY': return Colors.danger;
    case 'URGENT':    return Colors.warning;
    case 'ROUTINE':   return Colors.success;
    case 'RETAKE':    return Colors.neutral500;
    default:          return Colors.primary;
  }
}

export function getPriorityBackground(priority: string): string {
  switch (priority.toUpperCase()) {
    case 'EMERGENCY': return Colors.dangerLight;
    case 'URGENT':    return Colors.warningLight;
    case 'ROUTINE':   return Colors.successLight;
    default:          return Colors.primaryLight;
  }
}

export function formatConfidencePercent(score: number): string {
  return `${Math.round(score * 100)}%`;
}

export function getUncertaintyLabel(uncertaintyScore: number): string {
  if (uncertaintyScore < 0.15) return 'Low uncertainty';
  if (uncertaintyScore < 0.35) return 'Moderate uncertainty';
  return 'High uncertainty';
}

export function getUncertaintyColour(uncertaintyScore: number): string {
  if (uncertaintyScore < 0.15) return Colors.success;
  if (uncertaintyScore < 0.35) return Colors.warning;
  return Colors.danger;
}
