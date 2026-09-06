// ── Mock Data — shapes match api-contracts.md exactly ──

export const mockPatients = [
  { patientId: 'PHC001-lz3k9f-a2x9', name: 'Sunita Devi', age: 54, contactNumber: '+919812345678', registeredAt: '2026-09-06T09:00:00.000Z' },
  { patientId: 'PHC001-lz3k9g-b4y2', name: 'Ramesh Kumar', age: 62, contactNumber: '+919876543210', registeredAt: '2026-09-06T09:10:00.000Z' },
  { patientId: 'PHC001-lz3k9h-c6z5', name: 'Priya Sharma', age: 45, contactNumber: '+919912345678', registeredAt: '2026-09-06T09:20:00.000Z' },
  { patientId: 'PHC001-lz3k9i-d8w3', name: 'Anil Verma', age: 58, contactNumber: '+919823456789', registeredAt: '2026-09-06T09:35:00.000Z' },
  { patientId: 'PHC001-lz3k9j-e1v7', name: 'Kavita Joshi', age: 49, contactNumber: '+919834567890', registeredAt: '2026-09-06T09:50:00.000Z' },
];

export const mockCaptureResults = {
  pass: {
    captureId: 'PHC001-lz4a2b-c7f1',
    patientId: 'PHC001-lz3k9f-a2x9',
    qualityStatus: 'pass',
    qualityReason: null,
    retakeCount: 0,
    capturedAt: '2026-09-06T09:05:00.000Z',
  },
  retake: {
    captureId: 'PHC001-lz4a2c-d8g2',
    patientId: 'PHC001-lz3k9g-b4y2',
    qualityStatus: 'retake',
    qualityReason: 'blur',
    retakeCount: 1,
    capturedAt: '2026-09-06T09:15:00.000Z',
  },
  borderline: {
    captureId: 'PHC001-lz4a2d-e9h3',
    patientId: 'PHC001-lz3k9h-c6z5',
    qualityStatus: 'borderline',
    qualityReason: 'low_illumination',
    retakeCount: 0,
    capturedAt: '2026-09-06T09:25:00.000Z',
  },
};

export const qualityReasonMessages = {
  blur: 'Image is blurry — please stabilize the camera and retake',
  low_illumination: 'Image is too dark — adjust lighting and retake',
  insufficient_fov: 'Insufficient field of view — ensure full retinal coverage',
  glare: 'Glare detected in image — reduce direct light source',
  motion_artifact: 'Motion artifact detected — ask patient to hold still',
  eyelash_occlusion: 'Eyelash/eyelid obstruction — gently retract and retake',
};

export const mockQueueItems = [
  { captureId: 'PHC001-lz4a2b-c7f1', patientId: 'PHC001-lz3k9f-a2x9', patientName: 'Sunita Devi', status: 'result_delivered', capturedAt: '2026-09-06T09:05:00.000Z' },
  { captureId: 'PHC001-lz4a2c-d8g2', patientId: 'PHC001-lz3k9g-b4y2', patientName: 'Ramesh Kumar', status: 'synced', capturedAt: '2026-09-06T09:15:00.000Z' },
  { captureId: 'PHC001-lz4a2d-e9h3', patientId: 'PHC001-lz3k9h-c6z5', patientName: 'Priya Sharma', status: 'result_pending', capturedAt: '2026-09-06T09:25:00.000Z' },
  { captureId: 'PHC001-lz4a2e-f1i4', patientId: 'PHC001-lz3k9i-d8w3', patientName: 'Anil Verma', status: 'quality_passed', capturedAt: '2026-09-06T09:35:00.000Z' },
  { captureId: 'PHC001-lz4a2f-g2j5', patientId: 'PHC001-lz3k9j-e1v7', patientName: 'Kavita Joshi', status: 'captured', capturedAt: '2026-09-06T09:50:00.000Z' },
];

export const mockSyncStatus = {
  online: true,
  pendingCount: 2,
  lastSyncAttempt: '2026-09-06T09:40:00.000Z',
};

export const cameraDevices = [
  { id: 'forus_3nethra_v2', label: 'Forus 3Nethra v2' },
  { id: 'remidio_fop', label: 'Remidio FOP' },
  { id: 'generic_fundus', label: 'Generic Fundus Camera' },
  { id: 'unknown', label: 'Unknown / Other' },
];
