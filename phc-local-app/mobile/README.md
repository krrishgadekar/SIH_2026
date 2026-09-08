# RetinaSaarthi — Mobile Application

RetinaSaarthi is a cross-platform React Native / Expo application designed for Primary Health Centre (PHC) health-workers in rural India to screen patients for Diabetic Retinopathy (DR) using fundus photography.

---

## 🚀 Quick Start

### 1. Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- Expo Go on Android/iOS (or Android Emulator / iOS Simulator)

### 2. Install Dependencies
```bash
cd phc-local-app/mobile
npm install
```

### 3. Configure Backend Connection
Open [`src/config/api.ts`](file:///d:/RetinaSaarthi/Explainable-AI-for-Diabetic-Retinopathy-in-Rural-India/phc-local-app/mobile/src/config/api.ts):
```ts
// Set to your FastAPI server IP/hostname
export const API_BASE_URL = 'http://192.168.1.100:8000';

// Set to true to test the full UI flow with realistic mock fixtures without a backend
export const MOCK_MODE = false;
```

### 4. Run the App
```bash
# Start Expo development server
npm start

# Run on Android emulator / connected USB device
npm run android

# Type check
npm run type-check
```

---

## 📱 Workflow Screens

1. **Home Screen**:
   - Prominent **"Start New Screening"** button.
   - Real-time online/offline network indicator.
   - Recent cases list with DR grade status.
2. **Patient Registration**:
   - Patient Name, Age, and PHC Reference ID.
   - Validation ensures age between 1 and 120.
3. **Fundus Image Capture**:
   - Open Camera or Choose from Gallery.
   - High-contrast retinal circular aperture guide.
   - On-screen capture tips (lighting, pupil centering).
4. **Quality Assurance Check**:
   - **PASS**: Proceed directly.
   - **BORDERLINE**: Informs worker of automated enhancement.
   - **RETAKE**: Disables progression and shows actionable tips (blur, low illumination, eyelash occlusion).
5. **Clinical Questionnaire**:
   - Single-tap button groups: Diabetes duration, glycemic control, blood pressure, pregnancy.
   - Multi-select symptom chips.
   - Optional skip.
6. **Processing Screen**:
   - Visual progress indicator while AI model analyzes fundus image.
7. **Screening Result**:
   - Severity level Grade 0 (No DR) to Grade 4 (Proliferative DR).
   - Referable DR alert banner.
   - Predictive confidence score.
   - Recommendation & priority (ROUTINE, URGENT, EMERGENCY).
8. **Explainability & Grad-CAM**:
   - Toggle tabs: Original image, preprocessed image, and Grad-CAM attention heatmap.
   - Quality metrics table (sharpness, illumination, contrast).
   - Probability distribution across all 5 classes.
9. **Screening Report**:
   - Printable / shareable patient summary.
   - Direct export via system sharing sheet (WhatsApp, email, print).
10. **Offline Queue & History**:
    - Local case storage with `@react-native-async-storage/async-storage`.
    - Filter by All, Pending Sync, Synced, Errors.
    - Batch "Sync All" button when connectivity is restored.

---

## 🔒 Exact Backend API Contract

The app parses the FastAPI response strictly according to the backend schema:
- `status`: string
- `processedAt`: ISO 8601 timestamp
- `model`: `{ version, name, imageSize }`
- `input`: `{ filename, contentType, originalHeight, originalWidth }`
- `imageQuality`: `{ status, qualityScore, issues, metrics }`
- `enhancement`: `{ applied, steps, message }`
- `severity`: `{ level, code, label, classProbabilities }`
- `referableDR`: `{ isReferable, definition, probability, rawProbability, threshold }`
- `confidence`: `{ score, uncertaintyScore, predictiveEntropy, mcDropoutPasses }`
- `recommendation`: `{ action, priority }`
