import React, { useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { QualityResultPanel } from './QualityResultPanel';
import { CaptureMetadataForm } from './CaptureMetadataForm';
import { PatientQuestionnaireForm } from './PatientQuestionnaireForm';
import { localApi } from '../../api/localApiClient';
import { ML_API_ENDPOINT } from '../../config';

export const CaptureScreen = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const patientId = searchParams.get('patientId') || 'UNKNOWN_PATIENT';
  
  const [activeStep, setActiveStep] = useState(1);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [qualityResult, setQualityResult] = useState(null);
  const [metadata, setMetadata] = useState({});
  const [questionnaire, setQuestionnaire] = useState({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const fileInputRef = useRef(null);

  const handleCaptureClick = () => {
    if (fileInputRef.current && !imageFile) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      setImagePreviewUrl(URL.createObjectURL(file));
    }
  };

  const runQualityCheck = async () => {
    if (!imageFile) return;
    
    setIsAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append('file', imageFile);

      const response = await fetch(ML_API_ENDPOINT, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      
      // Map API response to UI model
      const apiStatus = data.imageQuality?.status || 'poor';
      let uiStatus = 'retake';
      if (apiStatus === 'good') uiStatus = 'pass';
      if (apiStatus === 'borderline') uiStatus = 'borderline';

      setQualityResult({
        captureId: `CAPT-${Date.now()}`,
        qualityStatus: uiStatus,
        issues: data.imageQuality?.issues || [],
        qualityScore: data.imageQuality?.qualityScore,
        aiPrediction: data // store full data for later
      });
      setActiveStep(2);
    } catch (err) {
      console.error("Quality Check Error:", err);
      alert("Failed to analyze image. Ensure the ML API is running.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleRetake = () => {
    setImageFile(null);
    setImagePreviewUrl(null);
    setQualityResult(null);
    setActiveStep(1);
    if (fileInputRef.current) {
      fileInputRef.current.value = ''; // clear input
    }
  };

  const handleAcceptQuality = () => {
    setActiveStep(3);
  };

  const handleSubmit = async () => {
    try {
      await localApi.saveCaptureMetadata(qualityResult.captureId, {
        metadata,
        questionnaire,
        aiPrediction: qualityResult.aiPrediction
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
            <span className="t-label">{imageFile ? 'CAPTURED' : 'READY'}</span>
          </div>
          
          <input 
            type="file" 
            accept="image/png, image/jpeg, image/jpg" 
            style={{ display: 'none' }} 
            ref={fileInputRef}
            onChange={handleFileChange}
          />

          <div className={`capture-zone ${imageFile ? 'has-image' : ''}`} onClick={handleCaptureClick}>
            {imagePreviewUrl ? (
              <img src={imagePreviewUrl} alt="Fundus Capture" className="capture-zone__preview" />
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
          
          {imageFile && activeStep === 1 && (
             <div className="u-mt-4 u-flex u-justify-between">
                <button className="btn btn--outline" onClick={handleRetake} disabled={isAnalyzing}>RETAKE</button>
                <button className="btn" onClick={runQualityCheck} disabled={isAnalyzing}>
                  {isAnalyzing ? 'ANALYZING... ✦' : 'RUN QUALITY CHECK ✦'}
                </button>
             </div>
          )}
        </div>

        {/* Right Column: Workflow Context */}
        <div className="panel capture-context-panel">
          {activeStep === 1 && (
            <div className="capture-instructions">
              <h2 className="t-h3" style={{ color: 'var(--c-crimson)' }}>INSTRUCTIONS</h2>
              <div className="capture-instructions__divider" />
              <ul className="capture-instructions__list">
                <li><span className="capture-instructions__num">01</span> Align patient head on chin rest.</li>
                <li><span className="capture-instructions__num">02</span> Adjust height until pupil is centered in feed.</li>
                <li><span className="capture-instructions__num">03</span> Ensure room lighting is sufficiently dim.</li>
                <li><span className="capture-instructions__num">04</span> Instruct patient to focus on internal green target.</li>
                <li><span className="capture-instructions__num">05</span> Initiate capture when focus indicator is solid.</li>
              </ul>
            </div>
          )}

          {activeStep === 2 && qualityResult && (
            <div className="capture-quality-wrapper">
              <QualityResultPanel result={qualityResult} onRetake={handleRetake} onAccept={handleAcceptQuality} />
            </div>
          )}

          {activeStep === 3 && (
            <div style={{ overflowY: 'auto', maxHeight: '500px', padding: 'var(--sp-4)' }}>
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
