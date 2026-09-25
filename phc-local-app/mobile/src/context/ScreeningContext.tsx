import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import {
  PatientInfo,
  QuestionnaireData,
  CentralCaseDetail,
  ScreeningSession,
  CaptureMetadataPayload,
  QualityGateResult,
} from '../types/screening';
import { generateLocalId } from '../utils/idGenerator';

// ── State ──────────────────────────────────────────────────────────────────

export interface ScreeningState {
  sessionId: string;
  patient: PatientInfo | null;
  imageUri: string | null;
  eyeLaterality: 'left' | 'right' | null;
  imageMimeType: string;
  imageFilename: string;
  questionnaire: QuestionnaireData;
  captureMetadata: CaptureMetadataPayload | null;
  qualityGateResult: QualityGateResult | null;
  centralCaseId: string | null;
  result: CentralCaseDetail | null;
  currentStep: number; // 1=Patient, 2=Capture, 3=Quality, 4=Questions, 5=Analysis, 6=Result
}

const initialQuestionnaire: QuestionnaireData = {
  riskFactors: {
    yearsSinceDiagnosis: null,
    glycemicControl: null,
    bloodPressure: null,
    pregnant: null,
  },
  symptoms: {
    blurredVision: false,
    floaters: false,
    suddenVisionChange: false,
    eyePain: false,
  },
  language: 'en',
};

const initialState: ScreeningState = {
  sessionId: generateLocalId(),
  patient: null,
  imageUri: null,
  eyeLaterality: null,
  imageMimeType: 'image/jpeg',
  imageFilename: 'retina.jpg',
  questionnaire: initialQuestionnaire,
  captureMetadata: null,
  qualityGateResult: null,
  centralCaseId: null,
  result: null,
  currentStep: 1,
};

// ── Actions ────────────────────────────────────────────────────────────────

type Action =
  | { type: 'SET_PATIENT'; payload: PatientInfo }
  | { type: 'SET_IMAGE'; payload: { uri: string; mimeType: string; filename: string; eyeLaterality?: 'left' | 'right' } }
  | { type: 'SET_QUESTIONNAIRE'; payload: Partial<QuestionnaireData> }
  | { type: 'SET_CAPTURE_METADATA'; payload: CaptureMetadataPayload }
  | { type: 'SET_QUALITY_GATE'; payload: QualityGateResult }
  | { type: 'SET_CENTRAL_CASE_ID'; payload: string }
  | { type: 'SET_RESULT'; payload: CentralCaseDetail }
  | { type: 'SET_STEP'; payload: number }
  | { type: 'RESTORE_SESSION'; payload: ScreeningSession }
  | { type: 'RESET_SESSION' };

function reducer(state: ScreeningState, action: Action): ScreeningState {
  switch (action.type) {
    case 'SET_PATIENT':
      return { ...state, patient: action.payload, currentStep: 2 };
    case 'SET_IMAGE':
      return {
        ...state,
        imageUri: action.payload.uri,
        imageMimeType: action.payload.mimeType,
        imageFilename: action.payload.filename,
        eyeLaterality: action.payload.eyeLaterality ?? state.eyeLaterality,
        currentStep: 3,
      };
    case 'SET_QUESTIONNAIRE':
      return {
        ...state,
        questionnaire: {
          ...state.questionnaire,
          ...action.payload,
          riskFactors: {
            ...state.questionnaire.riskFactors,
            ...(action.payload.riskFactors ?? {}),
          },
          symptoms: {
            ...state.questionnaire.symptoms,
            ...(action.payload.symptoms ?? {}),
          },
        },
      };
    case 'SET_CAPTURE_METADATA':
      return { ...state, captureMetadata: action.payload };
    case 'SET_QUALITY_GATE':
      return { ...state, qualityGateResult: action.payload };
    case 'SET_CENTRAL_CASE_ID':
      return { ...state, centralCaseId: action.payload };
    case 'SET_RESULT':
      return { ...state, result: action.payload, currentStep: 6 };
    case 'SET_STEP':
      return { ...state, currentStep: action.payload };
    case 'RESTORE_SESSION':
      return {
        sessionId: action.payload.id,
        patient: action.payload.patient,
        imageUri: action.payload.imageUri,
        eyeLaterality: action.payload.eyeLaterality ?? null,
        imageMimeType: 'image/jpeg',
        imageFilename: 'retina.jpg',
        questionnaire: action.payload.questionnaire,
        captureMetadata: action.payload.captureMetadata ?? null,
        qualityGateResult: action.payload.qualityGateResult ?? null,
        centralCaseId: action.payload.centralCaseId ?? null,
        result: action.payload.result,
        currentStep: action.payload.result ? 6 : 1,
      };
    case 'RESET_SESSION':
      return { ...initialState, sessionId: generateLocalId() };
    default:
      return state;
  }
}

// ── Context ────────────────────────────────────────────────────────────────

interface ScreeningContextValue {
  state: ScreeningState;
  setPatient: (patient: PatientInfo) => void;
  setImage: (uri: string, mimeType: string, filename: string, eyeLaterality?: 'left' | 'right') => void;
  updateQuestionnaire: (data: Partial<QuestionnaireData>) => void;
  setCaptureMetadata: (meta: CaptureMetadataPayload) => void;
  setQualityGate: (result: QualityGateResult) => void;
  setCentralCaseId: (id: string) => void;
  setResult: (result: CentralCaseDetail) => void;
  setStep: (step: number) => void;
  restoreSession: (session: ScreeningSession) => void;
  resetSession: () => void;
}

const ScreeningContext = createContext<ScreeningContextValue | undefined>(undefined);

export function ScreeningProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const value: ScreeningContextValue = {
    state,
    setPatient:          (patient) => dispatch({ type: 'SET_PATIENT', payload: patient }),
    setImage:            (uri, mimeType, filename, eyeLaterality) =>
                           dispatch({ type: 'SET_IMAGE', payload: { uri, mimeType, filename, eyeLaterality } }),
    updateQuestionnaire: (data) => dispatch({ type: 'SET_QUESTIONNAIRE', payload: data }),
    setCaptureMetadata:  (meta) => dispatch({ type: 'SET_CAPTURE_METADATA', payload: meta }),
    setQualityGate:      (result) => dispatch({ type: 'SET_QUALITY_GATE', payload: result }),
    setCentralCaseId:    (id) => dispatch({ type: 'SET_CENTRAL_CASE_ID', payload: id }),
    setResult:           (result) => dispatch({ type: 'SET_RESULT', payload: result }),
    setStep:             (step) => dispatch({ type: 'SET_STEP', payload: step }),
    restoreSession:      (session) => dispatch({ type: 'RESTORE_SESSION', payload: session }),
    resetSession:        () => dispatch({ type: 'RESET_SESSION' }),
  };

  return (
    <ScreeningContext.Provider value={value}>
      {children}
    </ScreeningContext.Provider>
  );
}

export function useScreening(): ScreeningContextValue {
  const ctx = useContext(ScreeningContext);
  if (!ctx) throw new Error('useScreening must be used within ScreeningProvider');
  return ctx;
}
