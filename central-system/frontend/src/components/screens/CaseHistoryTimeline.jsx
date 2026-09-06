import React from 'react';
import { drGradeLabels } from '../../api/mockData';

export const CaseHistoryTimeline = ({ priorAssessments }) => {
  if (!priorAssessments || priorAssessments.length === 0) {
    return (
      <div style={{ border: 'var(--border)', borderTop: 'none', padding: 'var(--sp-6)', textAlign: 'center' }}>
        <p className="t-mono" style={{ opacity: 0.4 }}>NO PRIOR ASSESSMENTS ON RECORD</p>
      </div>
    );
  }

  return (
    <div className="case-history" style={{ border: 'var(--border)', borderTop: 'none' }}>
      <div className="case-history__timeline">
        {priorAssessments.map((assessment, idx) => {
          const date = new Date(assessment.gradedAt);
          const grade = assessment.drGradeCnn;
          const isLast = idx === priorAssessments.length - 1;

          return (
            <div key={assessment.caseId} className="timeline-item">
              <div className="timeline-item__line">
                <div className={`timeline-item__dot ${grade >= 3 ? 'timeline-item__dot--danger' : grade >= 2 ? 'timeline-item__dot--warning' : 'timeline-item__dot--ok'}`} />
                {!isLast && <div className="timeline-item__connector" />}
              </div>
              <div className="timeline-item__content">
                <div className="u-flex u-justify-between u-items-center">
                  <div>
                    <span className="t-mono" style={{ fontWeight: 700 }}>
                      GRADE {grade} — {drGradeLabels[grade] || 'UNKNOWN'}
                    </span>
                    <br />
                    <span className="t-label" style={{ opacity: 0.5 }}>
                      {date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  <span className="t-mono" style={{ fontSize: 'var(--fs-tiny)', opacity: 0.3 }}>
                    {assessment.caseId.slice(0, 8)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Grade Trend Visual */}
      {priorAssessments.length > 1 && (
        <div className="case-history__trend" style={{ borderTop: 'var(--border)', padding: 'var(--sp-4) var(--sp-6)' }}>
          <span className="t-label" style={{ opacity: 0.5 }}>GRADE TREND</span>
          <div className="u-flex u-items-center u-gap-2" style={{ marginTop: 'var(--sp-2)' }}>
            {[...priorAssessments].reverse().map((a, idx, arr) => (
              <React.Fragment key={a.caseId}>
                <span className={`badge ${a.drGradeCnn >= 3 ? 'badge--fail' : a.drGradeCnn >= 2 ? 'badge--warning' : 'badge--pass'}`}>
                  G{a.drGradeCnn}
                </span>
                {idx < arr.length - 1 && (
                  <span className="t-mono" style={{ opacity: 0.3 }}>→</span>
                )}
              </React.Fragment>
            ))}
            <span className="t-label" style={{ marginLeft: 'var(--sp-2)', opacity: 0.4 }}>
              {priorAssessments[0].drGradeCnn > priorAssessments[priorAssessments.length - 1].drGradeCnn ? '↑ PROGRESSING' : '↓ STABLE/IMPROVING'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
