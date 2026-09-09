import React from 'react';
import { useTranslation } from 'react-i18next';
import { qualityReasonMessages } from '../../api/mockData';

export const QualityResultPanel = ({ result, onRetake, onAccept }) => {
  const { t } = useTranslation();
  const isPass = result.qualityStatus === 'pass';
  const isRetake = result.qualityStatus === 'retake';
  const isBorderline = result.qualityStatus === 'borderline';

  let statusClass = '';
  let title = '';
  let icon = '';
  let subtitle = '';

  if (isPass) {
    statusClass = 'qr--pass';
    title = t('quality.passTitle');
    icon = '✓';
    subtitle = t('quality.passSub');
  } else if (isRetake) {
    statusClass = 'qr--retake';
    title = t('quality.retakeTitle');
    icon = '✕';
    subtitle = t('quality.retakeSub');
  } else if (isBorderline) {
    statusClass = 'qr--borderline';
    title = t('quality.borderTitle');
    icon = '⚠';
    subtitle = t('quality.borderSub');
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
    <div className={`qr ${statusClass}`}>
      {/* ── Status Hero ── */}
      <div className="qr__hero">
        <div className="qr__icon-badge">{icon}</div>
        <div>
          <div className="qr__title">{title}</div>
          <div className="qr__subtitle">{subtitle}</div>
        </div>
      </div>

      {/* ── Score Gauge ── */}
      {qualityScore != null && (
        <div className="qr__score-block">
          <div className="qr__score-row">
            <span className="qr__score-label">{t('quality.score')}</span>
            <span className="qr__score-number">{qualityScore}<span className="qr__score-pct">%</span></span>
          </div>
          <div className="qr__bar-track">
            <div 
              className="qr__bar-fill" 
              style={{ 
                width: `${qualityScore}%`,
                background: qualityScore >= 70 
                  ? 'linear-gradient(90deg, var(--c-success), #3aad88)' 
                  : qualityScore >= 40 
                    ? 'linear-gradient(90deg, var(--c-warning), #e8a030)'
                    : 'linear-gradient(90deg, var(--c-crimson-dark), var(--c-crimson))'
              }} 
            />
          </div>
        </div>
      )}

      {/* ── Detailed Metrics ── */}
      {metrics && (
        <div className="qr__metrics-grid">
          {[
            { label: t('quality.metrics.focus'), value: metrics.focusScore, icon: '◉' },
            { label: t('quality.metrics.illumination'), value: metrics.illuminationScore, icon: '☀' },
            { label: t('quality.metrics.contrast'), value: metrics.contrastScore, icon: '◐' },
            { label: t('quality.metrics.coverage'), value: metrics.retinalCoverageScore, icon: '⊚' },
          ].map(m => (
            <div className="qr__metric-card" key={m.label}>
              <div className="qr__metric-top">
                <span className="qr__metric-icon">{m.icon}</span>
                <span className="qr__metric-pct" style={{ color: getScoreColor(m.value) }}>
                  {Math.round(m.value * 100)}%
                </span>
              </div>
              <div className="qr__metric-track">
                <div className="qr__metric-fill" style={{ width: `${Math.round(m.value * 100)}%`, background: getScoreColor(m.value) }} />
              </div>
              <span className="qr__metric-name">{m.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Issues Tags ── */}
      {result.issues && result.issues.length > 0 && (
        <div className="qr__issues">
          <span className="qr__issues-label">{t('quality.issues')}</span>
          <div className="qr__issues-tags">
            {result.issues.map((issue, i) => (
              <span className="qr__issue-chip" key={i}>
                {qualityReasonMessages[issue] || issue.replace(/_/g, ' ').toUpperCase()}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── AI Severity Card ── */}
      {severity && (
        <div className="qr__severity">
          <div className="qr__severity-top">
            <div>
              <div className="qr__severity-sub">{t('quality.severityTitle')}</div>
              <div className="qr__severity-name">{severity.label}</div>
            </div>
            <div className={`qr__grade-badge ${severity.level >= 3 ? 'qr__grade-badge--critical' : severity.level >= 2 ? 'qr__grade-badge--warning' : 'qr__grade-badge--safe'}`}>
              {t('quality.grade')} {severity.level}
            </div>
          </div>
          {confidence && (
            <div className="qr__confidence-row">
              <span className="qr__confidence-label">{t('quality.confidence')}</span>
              <div className="qr__bar-track qr__bar-track--sm">
                <div className="qr__bar-fill" style={{ width: `${Math.round(confidence.score * 100)}%`, background: 'linear-gradient(90deg, var(--c-crimson-dark), var(--c-crimson))' }} />
              </div>
              <span className="qr__confidence-val">{Math.round(confidence.score * 100)}%</span>
            </div>
          )}
        </div>
      )}

      {/* ── Action Bar ── */}
      <div className="qr__actions">
        <button className="btn btn--outline" onClick={onRetake}>{t('quality.btnBack')}</button>
        {!isRetake && (
          <button className={`btn ${isPass ? 'btn--success' : ''}`} onClick={onAccept}>
            {t('quality.btnAccept')}
          </button>
        )}
      </div>
    </div>
  );
};
