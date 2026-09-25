/**
 * TypeScript interfaces that EXACTLY mirror the FastAPI/Express backend JSON response.
 * Field names are preserved verbatim — do NOT rename them.
 */

// ── Central API Models ─────────────────────────────────────────────────────

export interface CaseSummaryResponse {
  caseId: string;
  receivedAt: string;
  status: 'processing' | 'awaiting_image' | 'graded' | 'error';
  duplicate?: boolean;
  fromSummary?: boolean;
}

export interface CaseStatusResponse {
  caseId: string;
  status: 'processing' | 'awaiting_image' | 'graded' | 'error';
}

export interface PatientSearchItem {
  patientId: string;
  patientReference: string;
  name: string;
  age: number;
  contactNumberMasked: string;
  registeredAt: string;
  matchedOn: string[];
  score: number;
}

export interface LesionCounts {
  microaneurysms: number | null;
  hemorrhages: number | null;
  hardExudates: number | null;
  softExudates: null;
  detail: {
    redTotal: number;
    redPerQuadrant: number[];
    brightPerQuadrant: number[];
    minAreaPx: number;
    procedure: string;
  };
}

export interface PriorAssessment {
  caseId: string;
  gradedAt: string;
  drGradeCnn: number | null;
}

export interface CentralCaseDetail {
  caseId: string;
  patientReference: string;
  imageUrl: string | null;
  gradCamOverlayUrl: string | null;
  lesionCounts: LesionCounts | null;
  nvSuspicionScore: number | null;
  evidenceSummaryText: string | null;
  drGradeCnn: number | null;
  drGradeRuleEngine: number | null;
  branchAgreement: boolean | null;
  confidenceScore: number | null;
  uncertaintyScore: number | null;
  conformalTier: 'A' | 'B' | 'C' | null;
  lesionAttentionConsistencyScore: number | null;
  questionnaireData: QuestionnaireData;
  captureMetadata: CaptureMetadataPayload;
  priorAssessments: PriorAssessment[];
  eyeLaterality: 'left' | 'right' | null;
  eyeLateralitySource: 'dicom' | 'technician' | null;
  eyeLateralityMismatch: boolean;
  foveaUnreliable: boolean | null;
  status: 'processing' | 'awaiting_image' | 'graded' | 'error';
  failureCode: string | null;
  failedAt: string | null;
}

// ── Local Quality Gate Result ──────────────────────────────────────────────

export type QualityStatus = 'pass' | 'borderline' | 'retake';
export type QualityReason = 'blur' | 'low_illumination' | 'insufficient_fov' | 'glare' | 'motion_artifact' | 'eyelash_occlusion' | null;

export interface QualityGateResult {
  status: QualityStatus;
  reason: QualityReason;
}

// ── Questionnaire ──────────────────────────────────────────────────────────

export type DiabetesDuration = 'lt1' | '1to5' | '5to10' | 'gt10';
export type GlycemicControl  = 'good' | 'moderate' | 'poor';
export type BloodPressure    = 'normal' | 'high' | 'unknown';

export interface QuestionnaireData {
  riskFactors: {
    yearsSinceDiagnosis: DiabetesDuration | null;
    glycemicControl: GlycemicControl | null;
    bloodPressure: BloodPressure | null;
    pregnant: boolean | null;
  };
  symptoms: {
    blurredVision: boolean;
    floaters: boolean;
    suddenVisionChange: boolean;
    eyePain: boolean;
  };
  language: string;
}

export interface CaptureMetadataPayload {
  cameraDeviceReported: string;
  pupilStatus: 'dilated' | 'non_dilated' | 'unknown';
  lightingEnvironment: 'indoor_clinic' | 'outdoor_mobile' | 'low_light';
  observedIssues: string[]; // e.g. ["none_noticed"]
  workerUsabilityRating: 'clear' | 'not_sure' | 'clearly_unusable';
  eyeLaterality?: 'left' | 'right';
}

// ── Full screening session ─────────────────────────────────────────────────

export interface PatientInfo {
  id?: string;
  name: string;
  age: number;
  contactNumber: string;
  referenceId: string;   // PHC reference / contact identifier
  consentGivenAt?: string;
}

export interface ScreeningSession {
  id: string;                         // local UUID
  patient: PatientInfo;
  imageUri: string | null;
  eyeLaterality: 'left' | 'right' | null;
  questionnaire: QuestionnaireData;
  captureMetadata?: CaptureMetadataPayload;
  qualityGateResult?: QualityGateResult;
  centralCaseId?: string;
  result: CentralCaseDetail | null;
  createdAt: string;                  // ISO timestamp
  syncStatus: 'pending' | 'synced' | 'error';
}

// Alias for backwards compatibility temporarily
export type ScreeningResult = CentralCaseDetail;
