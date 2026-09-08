/**
 * TypeScript interfaces that EXACTLY mirror the FastAPI backend JSON response.
 * Field names are preserved verbatim — do NOT rename them.
 */

// ── Backend response root ──────────────────────────────────────────────────

export interface ScreeningResult {
  status: string;
  processedAt: string;

  model: ModelInfo;
  input: InputInfo;
  imageQuality: ImageQuality;
  enhancement: Enhancement;
  severity: Severity;
  referableDR: ReferableDR;
  confidence: Confidence;
  recommendation: Recommendation;
}

// ── Sub-types (exact backend field names) ────────────────────────────────

export interface ModelInfo {
  version: string;
  name: string;
  imageSize: number;
}

export interface InputInfo {
  filename: string;
  contentType: string;
  originalHeight: number;
  originalWidth: number;
}

export interface ImageQuality {
  status: 'pass' | 'borderline' | 'retake' | 'good' | 'poor';
  qualityScore: number;
  issues: string[];
  metrics: Record<string, number>;
}

export interface Enhancement {
  applied: boolean;
  steps: string[];
  message: string;
}

export interface Severity {
  level: number;       // 0–4 (DR grade)
  code: string;        // e.g. 'no_dr', 'mild_npdr', 'moderate_npdr', 'severe_npdr', 'proliferative_dr'
  label: string;       // human-readable label from backend
  classProbabilities: Record<string, number> | number[];  // dictionary of class probabilities or array
}

export interface ReferableDR {
  isReferable: boolean;
  definition: string;
  probability: number;
  rawProbability: number;
  threshold: number;
}

export interface Confidence {
  score: number;
  uncertaintyScore: number;
  predictiveEntropy: number;
  mcDropoutPasses: number;
}

export interface Recommendation {
  action: string;
  priority: string;  // e.g. 'ROUTINE', 'URGENT', 'EMERGENCY'
}

// ── Local patient registration ─────────────────────────────────────────────

export interface PatientInfo {
  name: string;
  age: number;
  referenceId: string;   // PHC reference / contact identifier
}

// ── Questionnaire ──────────────────────────────────────────────────────────

export type DiabetesDuration = '<1' | '1-5' | '5-10' | '>10';
export type GlycemicControl  = 'good' | 'moderate' | 'poor';
export type BloodPressure    = 'normal' | 'high' | 'unknown';
export type PregnancyStatus  = 'yes' | 'no' | 'not_applicable';

export interface QuestionnaireData {
  diabetesDuration: DiabetesDuration | null;
  glycemicControl: GlycemicControl | null;
  bloodPressure: BloodPressure | null;
  pregnancy: PregnancyStatus | null;
  symptoms: SymptomKey[];
}

export type SymptomKey =
  | 'blurred_vision'
  | 'floaters'
  | 'sudden_vision_change'
  | 'eye_pain';

// ── Full screening session ─────────────────────────────────────────────────

export interface ScreeningSession {
  id: string;                         // local UUID
  patient: PatientInfo;
  imageUri: string | null;
  questionnaire: QuestionnaireData;
  result: ScreeningResult | null;
  createdAt: string;                  // ISO timestamp
  syncStatus: 'pending' | 'synced' | 'error';
}
