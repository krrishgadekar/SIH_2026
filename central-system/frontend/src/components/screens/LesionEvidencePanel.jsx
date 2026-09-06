import React from 'react';
import { drGradeLabels } from '../../api/mockData';

export const LesionEvidencePanel = ({ caseData }) => {
  const c = caseData;
  const lesions = c.lesionCounts || {};

  const lesionTypes = [
    { key: 'microaneurysms', label: 'MICROANEURYSMS', icon: '●', color: 'var(--c-crimson)' },
    { key: 'hemorrhages', label: 'HEMORRHAGES', icon: '●', color: 'var(--c-crimson-dark)' },
    { key: 'hardExudates', label: 'HARD EXUDATES', icon: '●', color: 'var(--c-warning)' },
    { key: 'softExudates', label: 'SOFT EXUDATES', icon: '●', color: '#CCAA66' },
  ];

  return (
    <div className="lesion-evidence" style={{ border: 'var(--border)', padding: 'var(--sp-6)' }}>
      <h3 className="t-h3 u-mb-4">LESION EVIDENCE</h3>

      {/* Lesion counts */}
      <div className="lesion-grid">
        {lesionTypes.map(lt => {
          const count = lesions[lt.key];
          return (
            <div key={lt.key} className="lesion-item">
              <span className="lesion-item__icon" style={{ color: lt.color }}>{lt.icon}</span>
              <span className="lesion-item__label t-label">{lt.label}</span>
              <span className="lesion-item__count t-mono" style={{ fontWeight: 700, fontSize: 'var(--fs-h3)' }}>
                {count !== null && count !== undefined ? count : <span style={{ opacity: 0.3 }}>N/A</span>}
              </span>
            </div>
          );
        })}
      </div>

      {/* NV Suspicion */}
      <div className="u-mt-4" style={{ borderTop: 'var(--border)', paddingTop: 'var(--sp-4)' }}>
        <div className="u-flex u-justify-between u-items-center">
          <span className="t-label">NV SUSPICION SCORE</span>
          {c.nvSuspicionScore !== null ? (
            <span className={`badge ${c.nvSuspicionScore > 0.5 ? 'badge--fail' : c.nvSuspicionScore > 0.3 ? 'badge--warning' : 'badge--pass'}`}>
              {(c.nvSuspicionScore * 100).toFixed(0)}% — {c.nvSuspicionScore > 0.5 ? 'HIGH' : c.nvSuspicionScore > 0.3 ? 'MODERATE' : 'LOW'}
            </span>
          ) : (
            <span className="t-mono" style={{ opacity: 0.3 }}>NOT YET AVAILABLE</span>
          )}
        </div>
      </div>

      {/* Evidence Summary */}
      {c.evidenceSummaryText && (
        <div className="u-mt-4" style={{ borderTop: 'var(--border)', paddingTop: 'var(--sp-4)' }}>
          <span className="t-label" style={{ opacity: 0.5 }}>AI EVIDENCE SUMMARY</span>
          <p className="t-body" style={{ marginTop: 'var(--sp-2)', fontSize: 'var(--fs-small)', lineHeight: 1.6 }}>
            {c.evidenceSummaryText}
          </p>
        </div>
      )}
    </div>
  );
};
