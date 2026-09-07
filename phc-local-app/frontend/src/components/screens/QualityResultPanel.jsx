import React from 'react';
import { qualityReasonMessages } from '../../api/mockData';

export const QualityResultPanel = ({ result, onRetake, onAccept }) => {
  const isPass = result.qualityStatus === 'pass';
  const isRetake = result.qualityStatus === 'retake';
  const isBorderline = result.qualityStatus === 'borderline';

  let panelClass = 'quality-result';
  let title = '';
  let icon = '';
  let subtitle = '';

  if (isPass) {
    panelClass += ' quality-result--pass';
    title = 'QUALITY PASS';
    icon = '✓';
    subtitle = 'Image meets diagnostic threshold';
  } else if (isRetake) {
    panelClass += ' quality-result--retake';
    title = 'RETAKE REQUIRED';
    icon = '✕';
    subtitle = 'Image below acceptable quality';
  } else if (isBorderline) {
    panelClass += ' quality-result--borderline';
    title = 'BORDERLINE QUALITY';
    icon = '⚠';
    subtitle = 'Image may affect AI accuracy';
  }

  const qualityScore = result.qualityScore != null ? Math.round(result.qualityScore * 100) : null;
  const prediction = result.aiPrediction;
  const metrics = prediction?.imageQuality?.metrics;
  const severity = prediction?.severity;
  const confidence = prediction?.confidence;

  const getScoreColor = (score) => {
    if (score >= 0.7) return 'var(--c-success)';
    if (score >= 0.4) return 'var(--c-warning)';
    return 'var(--c-crimson)';
  };

  return (
    <div className={panelClass}>
      {/* Hero Status */}
      <div className="quality-result__hero">
        <div className="quality-result__icon-ring">
          <div className="quality-result__icon">{icon}</div>
        </div>
        <div className="quality-result__status">{title}</div>
        <div className="quality-result__subtitle">{subtitle}</div>
      </div>

      {/* Quality Score Bar */}
      {qualityScore != null && (
        <div className="quality-result__score-section">
          <div className="quality-result__score-header">
            <span className="t-label">QUALITY SCORE</span>
            <span className="quality-result__score-value">{qualityScore}%</span>
          </div>
          <div className="quality-result__score-track">
            <div 
              className="quality-result__score-fill" 
              style={{ 
                width: `${qualityScore}%`,
                background: qualityScore >= 70 ? 'var(--c-success)' : qualityScore >= 40 ? 'var(--c-warning)' : 'var(--c-crimson)'
              }} 
            />
          </div>
        </div>
      )}

      {/* Quality Metrics Grid */}
      {metrics && (
        <div className="quality-result__metrics">
          {[
            { label: 'FOCUS', value: metrics.focusScore },
            { label: 'ILLUMINATION', value: metrics.illuminationScore },
            { label: 'CONTRAST', value: metrics.contrastScore },
            { label: 'COVERAGE', value: metrics.retinalCoverageScore },
          ].map(m => (
            <div className="quality-result__metric" key={m.label}>
              <div className="quality-result__metric-bar">
                <div 
                  className="quality-result__metric-fill"
                  style={{ width: `${Math.round(m.value * 100)}%`, background: getScoreColor(m.value) }}
                />
              </div>
              <div className="quality-result__metric-row">
                <span className="quality-result__metric-label">{m.label}</span>
                <span className="quality-result__metric-value" style={{ color: getScoreColor(m.value) }}>
                  {Math.round(m.value * 100)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Issues */}
      {result.issues && result.issues.length > 0 && (
        <div className="quality-result__issues">
          {result.issues.map((issue, i) => (
            <span className="quality-result__issue-tag" key={i}>
              {qualityReasonMessages[issue] || issue.replace(/_/g, ' ').toUpperCase()}
            </span>
          ))}
        </div>
      )}

      {/* AI Severity Preview (if available) */}
      {severity && (
        <div className="quality-result__severity-preview">
          <div className="quality-result__severity-header">
            <span className="t-label">AI SEVERITY PREDICTION</span>
          </div>
          <div className="quality-result__severity-row">
            <span className="quality-result__severity-label">{severity.label}</span>
            <span className={`badge ${severity.level >= 3 ? 'badge--fail' : severity.level >= 2 ? 'badge--warning' : 'badge--pass'}`}>
              GRADE {severity.level}
            </span>
          </div>
          {confidence && (
            <div className="quality-result__confidence">
              <span className="t-label">CONFIDENCE</span>
              <div className="quality-result__score-track" style={{ marginTop: '4px' }}>
                <div 
                  className="quality-result__score-fill" 
                  style={{ 
                    width: `${Math.round(confidence.score * 100)}%`,
                    background: 'var(--c-crimson)'
                  }} 
                />
              </div>
              <span className="quality-result__metric-value" style={{ fontSize: '14px', marginTop: '4px' }}>
                {Math.round(confidence.score * 100)}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="quality-result__actions">
        <button className="btn btn--outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)' }} onClick={onRetake}>
          ← RETAKE IMAGE
        </button>
        {!isRetake && (
          <button className={`btn ${isPass ? 'btn--success' : ''}`} onClick={onAccept}>
            ACCEPT & CONTINUE ✦
          </button>
        )}
      </div>
    </div>
  );
};
