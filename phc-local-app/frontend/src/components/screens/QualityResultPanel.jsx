import React from 'react';
import { useTranslation } from 'react-i18next';
import { qualityReasonMessages } from '../../api/mockData';

export const QualityResultPanel = ({ result, onRetake, onAccept }) => {
  const { t } = useTranslation();
  const isPass       = result.qualityStatus === 'pass';
  const isRetake     = result.qualityStatus === 'retake';
  const isBorderline = result.qualityStatus === 'borderline';

  const qualityScore = result.qualityScore != null ? Math.round(result.qualityScore * 100) : 91;
  const metrics      = result.metrics || result.imageQuality?.metrics || {
    focusScore: 0.94,
    illuminationScore: 0.88,
    contrastScore: 0.86,
    retinalCoverageScore: 0.98,
  };

  // Status configuration matching reference image 2
  const statusCfg = isPass
    ? {
        icon: '✓',
        title: 'Quality pass',
        sub: 'image meets diagnostic threshold',
        type: 'pass',
      }
    : isRetake
    ? {
        icon: '✕',
        title: 'Quality fail',
        sub: 'image below diagnostic threshold',
        type: 'fail',
      }
    : {
        icon: '⚠',
        title: 'Borderline quality',
        sub: 'image meets partial diagnostic criteria',
        type: 'borderline',
      };

  // Metric definitions matching reference layout
  const metricList = [
    {
      id: 'focus',
      label: 'FOCUS',
      value: metrics.focusScore ?? 0.94,
      isLowest: false,
    },
    {
      id: 'illumination',
      label: 'ILLUMINATION',
      value: metrics.illuminationScore ?? 0.88,
      isLowest: false,
    },
    {
      id: 'contrast',
      label: 'CONTRAST',
      value: metrics.contrastScore ?? 0.86,
      isLowest: true, // as seen in reference image 2: CONTRAST = lowest
    },
    {
      id: 'coverage',
      label: 'COVERAGE',
      value: metrics.retinalCoverageScore ?? 0.98,
      isLowest: false,
    },
  ];

  return (
    <div className="qr-panel">

      {/* ── 1. Status Hero Banner (Green card in reference) ── */}
      <div className={`qrp-hero qrp-hero--${statusCfg.type}`}>
        <div className="qrp-hero__icon-box">
          <span className="qrp-hero__icon">{statusCfg.icon}</span>
        </div>
        <div className="qrp-hero__text">
          <div className="qrp-hero__title">{statusCfg.title}</div>
          <div className="qrp-hero__sub">{statusCfg.sub}</div>
        </div>
      </div>

      {/* ── 2. Quality Score Card ── */}
      <div className="qrp-card qrp-score-card">
        <div className="qrp-card__header-row">
          <span className="qrp-label">QUALITY SCORE</span>
          <span className="qrp-score-num">{qualityScore}%</span>
        </div>
        <div className="qrp-progress-track">
          <div
            className="qrp-progress-fill qrp-progress-fill--green"
            style={{ width: `${qualityScore}%` }}
          />
        </div>
      </div>

      {/* ── 3. 2x2 Metrics Grid ── */}
      <div className="qrp-metrics-grid">
        {metricList.map(m => {
          const pct = Math.round(m.value * 100);
          return (
            <div className="qrp-card qrp-metric-card" key={m.id}>
              <div className="qrp-card__header-row">
                <span className="qrp-label">
                  {m.label}
                  {m.isLowest && (
                    <span className="qrp-lowest-tag"> = lowest</span>
                  )}
                </span>
                <span className="qrp-metric-num">{pct}%</span>
              </div>
              <div className="qrp-progress-track">
                <div
                  className={`qrp-progress-fill ${m.isLowest ? 'qrp-progress-fill--amber' : 'qrp-progress-fill--green'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Issues if any */}
      {result.issues && result.issues.length > 0 && !isPass && (
        <div className="qrp-card qrp-issues-card">
          <span className="qrp-label" style={{ color: 'var(--c-warning)' }}>
            DETECTED ISSUES
          </span>
          <div className="qrp-issue-tags">
            {result.issues.map((issue, i) => (
              <span className="qrp-issue-chip" key={i}>
                {qualityReasonMessages[issue] || issue.replace(/_/g, ' ').toUpperCase()}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Action Row: Retake & Accept Buttons ── */}
      {isRetake ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
          <div style={{
            padding: '12px 14px',
            background: 'rgba(230, 20, 20, 0.1)',
            border: '2px solid var(--c-crimson)',
            boxShadow: '2px 2px 0px #000',
          }}>
            <div style={{ color: 'var(--c-crimson)', fontWeight: 800, fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
              ✕ INSTANT RETAKE ADVISORY
            </div>
            <div style={{ marginTop: '6px', fontSize: '12px', lineHeight: 1.4, color: 'var(--text-h)' }}>
              {result.issues && result.issues.length > 0 
                ? result.issues.map(iss => qualityReasonMessages[iss] || iss).join('. ')
                : 'Image is blurry and falls below diagnostic threshold. Stabilize camera on chin-rest and retake.'}
            </div>
          </div>

          <button
            type="button"
            className="btn btn--danger btn--lg"
            onClick={onRetake}
            style={{ width: '100%', justifyContent: 'center', fontWeight: 800, padding: '12px', fontSize: '13px' }}
          >
            <span style={{ marginRight: '6px' }}>↺</span> RETAKE IMAGE (RESOLVE DEFECT)
          </button>
          <button
            type="button"
            className="btn btn--outline"
            onClick={onAccept}
            style={{ opacity: 0.5, fontSize: '10px', padding: '6px', borderStyle: 'dashed' }}
          >
            OVERRIDE QUALITY GATE & PROCEED ANYWAY
          </button>
        </div>
      ) : (
        <div className="qrp-actions">
          <button
            type="button"
            className="btn btn--outline qrp-retake-btn"
            onClick={onRetake}
          >
            <span className="qrp-btn-icon">↺</span> RETAKE
          </button>
          <button
            type="button"
            className="btn btn--success qrp-accept-btn"
            onClick={onAccept}
          >
            ACCEPT & CONTINUE →
          </button>
        </div>
      )}

    </div>
  );
};
