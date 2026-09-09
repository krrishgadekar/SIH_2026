import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import {
  PatientInfo,
  QuestionnaireData,
  ScreeningResult,
  ScreeningSession,
} from '../types/screening';
import { generateSessionId } from '../utils/dateHelpers';

// ── State ──────────────────────────────────────────────────────────────────

export interface ScreeningState {
  sessionId: string;
  patient: PatientInfo | null;
  imageUri: string | null;
  imageMimeType: string;
  imageFilename: string;
  questionnaire: QuestionnaireData;
  result: ScreeningResult | null;
  currentStep: number; // 1=Patient, 2=Capture, 3=Quality, 4=Questions, 5=Analysis, 6=Result
}

const initialQuestionnaire: QuestionnaireData = {
  diabetesDuration: null,
  glycemicControl: null,
  bloodPressure: null,
  pregnancy: null,
  symptoms: [],
};

const initialState: ScreeningState = {
  sessionId: generateSessionId(),
  patient: null,
  imageUri: null,
  imageMimeType: 'image/jpeg',
  imageFilename: 'retina.jpg',
  questionnaire: initialQuestionnaire,
  result: null,
  currentStep: 1,
};

// ── Actions ────────────────────────────────────────────────────────────────

type Action =
  | { type: 'SET_PATIENT'; payload: PatientInfo }
  | { type: 'SET_IMAGE'; payload: { uri: string; mimeType: string; filename: string } }
  | { type: 'SET_QUESTIONNAIRE'; payload: Partial<QuestionnaireData> }
  | { type: 'SET_RESULT'; payload: ScreeningResult }
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
        currentStep: 3,
      };
    case 'SET_QUESTIONNAIRE':
      return {
        ...state,
        questionnaire: { ...state.questionnaire, ...action.payload },
      };
    case 'SET_RESULT':
      return { ...state, result: action.payload, currentStep: 6 };
    case 'SET_STEP':
      return { ...state, currentStep: action.payload };
    case 'RESTORE_SESSION':
      return {
        sessionId: action.payload.id,
        patient: action.payload.patient,
        imageUri: action.payload.imageUri,
        imageMimeType: 'image/jpeg',
        imageFilename: 'retina.jpg',
        questionnaire: action.payload.questionnaire,
        result: action.payload.result,
        currentStep: action.payload.result ? 6 : 1,
      };
    case 'RESET_SESSION':
      return { ...initialState, sessionId: generateSessionId() };
    default:
      return state;
  }
}

// ── Context ────────────────────────────────────────────────────────────────

interface ScreeningContextValue {
  state: ScreeningState;
  setPatient: (patient: PatientInfo) => void;
  setImage: (uri: string, mimeType: string, filename: string) => void;
  updateQuestionnaire: (data: Partial<QuestionnaireData>) => void;
  setResult: (result: ScreeningResult) => void;
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
    setImage:            (uri, mimeType, filename) =>
                           dispatch({ type: 'SET_IMAGE', payload: { uri, mimeType, filename } }),
    updateQuestionnaire: (data) => dispatch({ type: 'SET_QUESTIONNAIRE', payload: data }),
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
