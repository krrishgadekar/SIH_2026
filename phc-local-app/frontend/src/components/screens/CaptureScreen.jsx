import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { QualityResultPanel } from './QualityResultPanel';
import { CaptureMetadataForm } from './CaptureMetadataForm';
import { PatientQuestionnaireForm } from './PatientQuestionnaireForm';
import { localApi } from '../../api/localApiClient';
import { mockCaptureResults } from '../../api/mockData';

export const CaptureScreen = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const patientId = searchParams.get('patientId') || 'UNKNOWN_PATIENT';
  
  const [activeStep, setActiveStep] = useState(1);
  const [image, setImage] = useState(null);
  const [qualityResult, setQualityResult] = useState(null);
  const [metadata, setMetadata] = useState({});
  const [questionnaire, setQuestionnaire] = useState({});

  const handleCapture = () => {
    // Simulate taking a photo and receiving a result
    setImage('mock_fundus_image.jpg');
    // For demo purposes, randomly select a quality result
    const results = Object.values(mockCaptureResults);
    const randomResult = results[Math.floor(Math.random() * results.length)];
    setQualityResult(randomResult);
    setActiveStep(2);
  };

  const handleRetake = () => {
    setImage(null);
    setQualityResult(null);
    setActiveStep(1);
  };

  const handleAcceptQuality = () => {
    setActiveStep(3);
  };

  const handleSubmit = async () => {
    try {
      await localApi.saveCaptureMetadata(qualityResult.captureId, {
        metadata,
        questionnaire
      });
      navigate('/queue');
    } catch (err) {
      alert('Failed to save capture data');
    }
  };

  return (
    <div className="section">
      <div className="u-flex u-justify-between u-items-center u-mb-6">
        <h1 className="t-h1">IMAGE CAPTURE</h1>
        <div className="t-mono" style={{ opacity: 0.6 }}>
          PATIENT: {patientId}
        </div>
      </div>

      <div className="stepper u-mb-6">
        <div className={`stepper__step ${activeStep === 1 ? 'active' : ''} ${activeStep > 1 ? 'completed' : ''}`}>1. CAPTURE</div>
        <div className={`stepper__step ${activeStep === 2 ? 'active' : ''} ${activeStep > 2 ? 'completed' : ''}`}>2. QUALITY GATE</div>
        <div className={`stepper__step ${activeStep === 3 ? 'active' : ''}`}>3. METADATA & SYNC</div>
      </div>

      <div className="grid grid--2">
        {/* Left Column: Image Area */}
        <div className="panel u-p-4 hash-fill" style={{ minHeight: '500px' }}>
          <div className="u-flex u-justify-between u-mb-2">
            <span className="t-label">LIVE FEED / PREVIEW</span>
            <span className="t-label">{image ? 'CAPTURED' : 'READY'}</span>
          </div>
          
          <div className={`capture-zone ${image ? 'has-image' : ''}`} onClick={!image ? handleCapture : undefined}>
            {image ? (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--c-black)'}}>
                 {/* Placeholder for actual image */}
                 <div className="t-mono" style={{ color: 'var(--c-crimson)', opacity: 0.5 }}>FUNDUS_IMAGE_PLACEHOLDER</div>
              </div>
            ) : (
              <>
                <div className="capture-zone__placeholder">
                  <div className="capture-zone__placeholder-icon">◎</div>
                  <div className="t-mono">CLICK TO INITIATE CAPTURE SEQUENCE</div>
                </div>
                <div className="capture-zone__crosshair"></div>
              </>
            )}
          </div>
          
          {image && activeStep === 1 && (
             <div className="u-mt-4 u-flex u-justify-between">
                <button className="btn btn--outline" onClick={handleRetake}>RETAKE</button>
                <button className="btn" onClick={() => setActiveStep(2)}>RUN QUALITY CHECK ✦</button>
             </div>
          )}
        </div>

        {/* Right Column: Workflow Context */}
        <div className="panel" style={{ background: 'var(--c-black)' }}>
          {activeStep === 1 && (
            <div className="u-p-6">
              <h2 className="t-h3" style={{ color: 'var(--c-crimson)' }}>INSTRUCTIONS</h2>
              <ul className="t-mono u-mt-4" style={{ color: 'var(--c-text-muted)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <li>1. Align patient head on chin rest.</li>
                <li>2. Adjust height until pupil is centered in feed.</li>
                <li>3. Ensure room lighting is sufficiently dim.</li>
                <li>4. Instruct patient to focus on internal green target.</li>
                <li>5. Initiate capture when focus indicator is solid.</li>
              </ul>
            </div>
          )}

          {activeStep === 2 && qualityResult && (
            <div className="u-p-4">
              <QualityResultPanel result={qualityResult} onRetake={handleRetake} onAccept={handleAcceptQuality} />
            </div>
          )}

          {activeStep === 3 && (
            <div className="u-p-4" style={{ overflowY: 'auto', maxHeight: '500px' }}>
              <CaptureMetadataForm onChange={setMetadata} />
              <div className="u-mt-6">
                <PatientQuestionnaireForm onChange={setQuestionnaire} />
              </div>
              <div className="u-mt-6 u-text-right">
                 <button className="btn btn--success" onClick={handleSubmit}>QUE FOR SYNC ✦</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
