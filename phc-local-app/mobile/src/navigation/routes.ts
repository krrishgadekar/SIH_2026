export const Routes = {
  // Main tabs
  Home:                 'Home',
  History:              'History',

  // Screening flow (stack)
  PatientRegistration:  'PatientRegistration',
  Capture:              'Capture',
  QualityResult:        'QualityResult',
  Questionnaire:        'Questionnaire',
  Processing:           'Processing',
  Result:               'Result',
  Explainability:       'Explainability',
  Report:               'Report',
} as const;

export type RouteKey = keyof typeof Routes;
export type RouteName = typeof Routes[RouteKey];
