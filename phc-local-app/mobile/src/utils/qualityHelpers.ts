import { Colors } from '../theme';

/**
 * Image quality issue → human-readable reason mapping.
 * Turns backend issue codes into actionable instructions for the health worker.
 */

export interface QualityIssueDisplay {
  title: string;
  instruction: string;
}

const ISSUE_MAP: Record<string, QualityIssueDisplay> = {
  blur: {
    title: 'Image is blurry',
    instruction: 'Hold the camera steady and ensure the lens is clean.',
  },
  low_illumination: {
    title: 'Low illumination',
    instruction: 'Move to a brighter area or switch on the room light before capturing.',
  },
  insufficient_fov: {
    title: 'Insufficient field of view',
    instruction: 'Position the camera closer to the eye to capture the full retina.',
  },
  glare: {
    title: 'Glare detected',
    instruction: 'Reduce surrounding bright lights and ask the patient to look directly ahead.',
  },
  motion_artifact: {
    title: 'Motion detected',
    instruction: 'Ask the patient to remain still. Stabilise the device during capture.',
  },
  eyelash_occlusion: {
    title: 'Eyelashes in view',
    instruction: 'Ask the patient to open their eye wider or gently hold the eyelid up.',
  },
  slight_blur: {
    title: 'Slight blurring',
    instruction: 'Steady the camera — image was enhanced automatically.',
  },
  // Generic fallback keys
  motion: {
    title: 'Motion artifact',
    instruction: 'Ask the patient to remain still. Stabilise the device during capture.',
  },
  occlusion: {
    title: 'Eye obstruction',
    instruction: 'Ask the patient to open their eye wider.',
  },
};

export function getQualityIssueDisplay(issueCode: string): QualityIssueDisplay {
  const key = issueCode.toLowerCase().replace(/ /g, '_');
  return (
    ISSUE_MAP[key] ?? {
      title: 'Image quality issue',
      instruction: 'Please retake the image in better conditions.',
    }
  );
}

export interface QualityStatusDisplay {
  label: string;
  colour: string;
  backgroundColour: string;
  badgeText: string;
}

export function getQualityStatusDisplay(status: 'pass' | 'borderline' | 'retake' | 'good' | 'poor' | string): QualityStatusDisplay {
  switch (status) {
    case 'pass':
    case 'good':
      return {
        label: 'Good quality',
        colour: Colors.success,
        backgroundColour: Colors.successLight,
        badgeText: 'PASS',
      };
    case 'borderline':
      return {
        label: 'Borderline quality — enhancement applied',
        colour: Colors.warning,
        backgroundColour: Colors.warningLight,
        badgeText: 'BORDERLINE',
      };
    case 'retake':
    case 'poor':
    default:
      return {
        label: 'Image quality too low — please retake',
        colour: Colors.danger,
        backgroundColour: Colors.dangerLight,
        badgeText: 'RETAKE',
      };
  }
}

export function formatQualityScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}
