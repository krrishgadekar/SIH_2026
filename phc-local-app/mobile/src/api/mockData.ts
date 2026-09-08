import { ScreeningResult } from '../types/screening';

/**
 * Realistic mock response that exercises every branch of the UI.
 * Toggle quality status here to test PASS / BORDERLINE / RETAKE flows.
 */
export const MOCK_PASS_RESULT: ScreeningResult = {
  status: 'success',
  processedAt: new Date().toISOString(),
  model: {
    version: '2.1.0',
    name: 'RetinaDR-EfficientNet-B3',
    imageSize: 512,
  },
  input: {
    filename: 'retina_capture.jpg',
    contentType: 'image/jpeg',
    originalHeight: 2448,
    originalWidth: 3264,
  },
  imageQuality: {
    status: 'pass',
    qualityScore: 0.87,
    issues: [],
    metrics: {
      focusScore: 0.91,
      illuminationScore: 0.85,
      fovScore: 0.88,
      coveragePercent: 0.83,
      glareScore: 0.04,
      motionScore: 0.07,
      occlusionScore: 0.05,
    },
  },
  enhancement: {
    applied: false,
    steps: [],
    message: 'No enhancement required — image quality is good.',
  },
  severity: {
    level: 2,
    code: 'MODERATE',
    label: 'Moderate Non-Proliferative Diabetic Retinopathy',
    classProbabilities: [0.04, 0.09, 0.71, 0.12, 0.04],
  },
  referableDR: {
    isReferable: true,
    definition: 'Diabetic retinopathy at moderate or higher severity requiring ophthalmologist evaluation.',
    probability: 0.87,
    rawProbability: 0.87,
    threshold: 0.5,
  },
  confidence: {
    score: 0.85,
    uncertaintyScore: 0.15,
    predictiveEntropy: 0.31,
    mcDropoutPasses: 20,
  },
  recommendation: {
    action: 'Refer to district eye clinic within 4 weeks for ophthalmologist review.',
    priority: 'URGENT',
  },
};

export const MOCK_BORDERLINE_RESULT: ScreeningResult = {
  ...MOCK_PASS_RESULT,
  imageQuality: {
    status: 'borderline',
    qualityScore: 0.58,
    issues: ['low_illumination', 'slight_blur'],
    metrics: {
      focusScore: 0.61,
      illuminationScore: 0.52,
      fovScore: 0.79,
      coveragePercent: 0.71,
      glareScore: 0.06,
      motionScore: 0.18,
      occlusionScore: 0.09,
    },
  },
  enhancement: {
    applied: true,
    steps: ['CLAHE contrast enhancement', 'Sharpening filter'],
    message: 'Automatic enhancement applied to improve image quality for analysis.',
  },
};

export const MOCK_RETAKE_RESULT: ScreeningResult = {
  ...MOCK_PASS_RESULT,
  imageQuality: {
    status: 'retake',
    qualityScore: 0.28,
    issues: ['blur', 'low_illumination', 'insufficient_fov'],
    metrics: {
      focusScore: 0.29,
      illuminationScore: 0.34,
      fovScore: 0.41,
      coveragePercent: 0.48,
      glareScore: 0.11,
      motionScore: 0.52,
      occlusionScore: 0.22,
    },
  },
  enhancement: {
    applied: false,
    steps: [],
    message: 'Image quality too low — enhancement not applied. Please retake.',
  },
  severity: {
    level: 0,
    code: 'UNDETERMINED',
    label: 'Undetermined — image quality insufficient',
    classProbabilities: [0.2, 0.2, 0.2, 0.2, 0.2],
  },
  referableDR: {
    isReferable: false,
    definition: 'Cannot determine referral status — image quality insufficient.',
    probability: 0.0,
    rawProbability: 0.0,
    threshold: 0.5,
  },
  confidence: {
    score: 0.0,
    uncertaintyScore: 1.0,
    predictiveEntropy: 1.0,
    mcDropoutPasses: 0,
  },
  recommendation: {
    action: 'Retake image with better lighting and stable positioning.',
    priority: 'RETAKE',
  },
};

export const MOCK_NO_DR_RESULT: ScreeningResult = {
  ...MOCK_PASS_RESULT,
  severity: {
    level: 0,
    code: 'NO_DR',
    label: 'No Diabetic Retinopathy',
    classProbabilities: [0.91, 0.04, 0.03, 0.01, 0.01],
  },
  referableDR: {
    isReferable: false,
    definition: 'No referable diabetic retinopathy detected.',
    probability: 0.09,
    rawProbability: 0.09,
    threshold: 0.5,
  },
  confidence: {
    score: 0.93,
    uncertaintyScore: 0.07,
    predictiveEntropy: 0.14,
    mcDropoutPasses: 20,
  },
  recommendation: {
    action: 'No diabetic retinopathy detected. Continue annual screening.',
    priority: 'ROUTINE',
  },
};

export const REAL_MODEL_MOCK: ScreeningResult = {
  status: 'success',
  processedAt: new Date().toISOString(),
  model: {
    version: 'retinasaarthi-efficientnetb0-v1',
    name: 'tf_efficientnet_b0.ns_jft_in1k',
    imageSize: 384,
  },
  input: {
    filename: 'retina_scan.png',
    contentType: 'image/png',
    originalHeight: 1000,
    originalWidth: 1504,
  },
  imageQuality: {
    status: 'borderline',
    qualityScore: 0.577,
    issues: ['blur'],
    metrics: {
      focusScore: 0.1147,
      illuminationScore: 0.5355,
      contrastScore: 0.6773,
      retinalCoverageScore: 1.0,
      glarePenalty: 0.0,
    },
  },
  enhancement: {
    applied: true,
    steps: [
      'retinal_roi_crop',
      'illumination_normalization',
      'clahe',
      'mild_denoising',
    ],
    message: 'Image enhancement applied before severity prediction.',
  },
  severity: {
    level: 4,
    code: 'proliferative_dr',
    label: 'Proliferative Diabetic Retinopathy',
    classProbabilities: {
      no_dr: 0.129933,
      mild_npdr: 0.248943,
      moderate_npdr: 0.18748,
      severe_npdr: 0.060209,
      proliferative_dr: 0.373436,
    },
  },
  referableDR: {
    isReferable: true,
    definition: 'severity_level_2_or_higher',
    probability: 0.502681,
    rawProbability: 0.491848,
    threshold: 0.341616,
  },
  confidence: {
    score: 0.373436,
    uncertaintyScore: 0.00101427,
    predictiveEntropy: 1.462199,
    mcDropoutPasses: 5,
  },
  recommendation: {
    action: 'urgent_ophthalmology_review',
    priority: 'urgent',
  },
};

/**
 * Active mock — change this to test different quality/result flows.
 * Options: REAL_MODEL_MOCK | MOCK_PASS_RESULT | MOCK_BORDERLINE_RESULT | MOCK_RETAKE_RESULT | MOCK_NO_DR_RESULT
 */
export const ACTIVE_MOCK = REAL_MODEL_MOCK;

