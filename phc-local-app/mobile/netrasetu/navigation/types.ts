export interface LensPhoto { uri: string; width: number; height: number; takenAt: string }

export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  Capture: { patientId: string; newRegistration?: boolean; lensPhoto?: LensPhoto };
  LensCamera: { patientId: string };
  CaseReport: { captureId: string };
  Settings: undefined;
  Pairing: undefined;
};

export type TabParamList = {
  Register: undefined;
  Queue: undefined;
};
