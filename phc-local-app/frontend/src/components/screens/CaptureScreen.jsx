import React, { useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { QualityResultPanel } from './QualityResultPanel';
import { CaptureMetadataForm } from './CaptureMetadataForm';
import { PatientQuestionnaireForm } from './PatientQuestionnaireForm';
import { localApi } from '../../api/localApiClient';
import { ML_API_ENDPOINT, USE_MOCK_DATA } from '../../config';
import { mockAiPredictions } from '../../api/mockData';
import demoFundusImg from '../../assets/hero.png';

export const CaptureScreen = () => {
  const { t } = useTranslation();
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
  const [mockScenario, setMockScenario] = useState('pass');
  
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

  const handleLoadDemoImage = async (e) => {
    e?.stopPropagation();
    try {
      const response = await fetch(demoFundusImg);
      const blob = await response.blob();
      const file = new File([blob], 'demo_fundus_retina.png', { type: 'image/png' });
      setImageFile(file);
      setImagePreviewUrl(demoFundusImg);
    } catch (err) {
      console.warn("Could not load demo fundus image:", err);
    }
  };

  const runQualityCheck = async () => {
    if (!imageFile) return;
    
    setIsAnalyzing(true);
    try {
      let data = null;

      // If mock mode is disabled, try real ML API first
      if (!USE_MOCK_DATA) {
        try {
          const formData = new FormData();
          formData.append('file', imageFile);

          const response = await fetch(ML_API_ENDPOINT, {
            method: 'POST',
            body: formData,
          });

          if (response.ok) {
            data = await response.json();
          }
        } catch (apiErr) {
          console.warn("ML API call failed, falling back to mock data:", apiErr);
        }
      }

      // If in mock mode or API failed, load realistic mock prediction
      if (!data || !data.imageQuality) {
        await new Promise(r => setTimeout(r, 900)); // scanning latency
        data = JSON.parse(JSON.stringify(mockAiPredictions[mockScenario] || mockAiPredictions.pass));
        data.input.filename = imageFile.name;
        data.processedAt = new Date().toISOString();
      }
      
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
      alert("Failed to analyze image.");
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
        <h1 className="t-h1">{t('capture.title')}</h1>
        <div className="t-mono" style={{ opacity: 0.6 }}>
          {t('capture.patient')} {patientId}
        </div>
      </div>

      <div className="stepper u-mb-6">
        <div className={`stepper__step ${activeStep === 1 ? 'active' : ''} ${activeStep > 1 ? 'completed' : ''}`}>{t('capture.steps.capture')}</div>
        <div className={`stepper__step ${activeStep === 2 ? 'active' : ''} ${activeStep > 2 ? 'completed' : ''}`}>{t('capture.steps.quality')}</div>
        <div className={`stepper__step ${activeStep === 3 ? 'active' : ''}`}>{t('capture.steps.metadata')}</div>
      </div>

      <div className="grid grid--2">
        {/* Left Column: Image Area */}
        <div className="panel u-p-4 hash-fill" style={{ minHeight: '500px' }}>
          <div className="u-flex u-justify-between u-mb-2">
            <span className="t-label">{t('capture.preview')}</span>
            <span className="t-label">{imageFile ? t('capture.statusCaptured') : t('capture.statusReady')}</span>
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
                  <div className="t-mono u-mb-3">{t('capture.clickToInitiate')}</div>
                  <button 
                    type="button" 
                    className="btn btn--outline" 
                    style={{ fontSize: '0.72rem', padding: '6px 14px', zIndex: 10, cursor: 'pointer' }}
                    onClick={handleLoadDemoImage}
                  >
                    {t('capture.loadSample')}
                  </button>
                </div>
                <div className="capture-zone__crosshair"></div>
              </>
            )}
          </div>
          
          {imageFile && activeStep === 1 && (
            <div className="u-mt-4">
              <div className="u-flex u-justify-between u-items-center u-mb-3" style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                <span style={{ color: 'var(--c-cream-dark)', letterSpacing: '0.05em' }}>{t('capture.mockScenario')}</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {[
                    { id: 'pass', label: t('capture.scenarioPass') },
                    { id: 'borderline', label: t('capture.scenarioBorderline') },
                    { id: 'retake', label: t('capture.scenarioRetake') }
                  ].map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setMockScenario(s.id)}
                      style={{
                        padding: '3px 9px',
                        fontSize: '0.68rem',
                        fontFamily: 'var(--font-mono)',
                        border: `1px solid ${mockScenario === s.id ? 'var(--c-crimson)' : 'var(--c-cream-dark)'}`,
                        background: mockScenario === s.id ? 'var(--c-crimson)' : 'transparent',
                        color: mockScenario === s.id ? '#ffffff' : 'inherit',
                        borderRadius: '2px',
                        cursor: 'pointer',
                        fontWeight: mockScenario === s.id ? 'bold' : 'normal',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="u-flex u-justify-between">
                <button className="btn btn--outline" onClick={handleRetake} disabled={isAnalyzing}>{t('capture.btnRetake')}</button>
                <button className="btn" onClick={runQualityCheck} disabled={isAnalyzing}>
                  {isAnalyzing ? t('capture.btnAnalyzing') : t('capture.btnAnalyze')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Workflow Context */}
        <div className="panel capture-context-panel">
          {activeStep === 1 && (
            <div className="capture-instructions">
              <h2 className="t-h3" style={{ color: 'var(--c-crimson)' }}>{t('capture.instructionsTitle')}</h2>
              <div className="capture-instructions__divider" />
              <ul className="capture-instructions__list">
                {t('capture.instructions', { returnObjects: true }).map((instruction, idx) => (
                  <li key={idx}><span className="capture-instructions__num">0{idx + 1}</span> {instruction}</li>
                ))}
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
                 <button className="btn btn--success" onClick={handleSubmit}>{t('quality.btnQue')}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
