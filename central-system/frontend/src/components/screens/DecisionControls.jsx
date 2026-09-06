import React, { useState } from 'react';
import { drGradeLabels, overrideReasonCategories } from '../../api/mockData';

export const DecisionControls = ({ caseData, onSubmit, submitted }) => {
  const [decision, setDecision] = useState(null); // 'confirm' | 'override'
  const [overrideGrade, setOverrideGrade] = useState('');
  const [overrideCategory, setOverrideCategory] = useState('');
  const [overrideText, setOverrideText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!decision) return;
    setSubmitting(true);

    const reviewData = {
      ophthalmologistId: 'OPHTH-001', // In real app, from auth
      decision,
      overrideReasonCategory: decision === 'override' ? overrideCategory : null,
      overrideReasonText: decision === 'override' && overrideText ? overrideText : null,
    };

    await onSubmit(reviewData);
    setSubmitting(false);
  };

  return (
    <div className="decision-controls" style={{ border: 'var(--border)' }}>
      <div style={{ padding: 'var(--sp-4) var(--sp-6)', borderBottom: 'var(--border)', background: 'var(--c-black)', color: 'var(--c-crimson)' }}>
        <h3 className="t-h3" style={{ margin: 0 }}>CLINICAL DECISION</h3>
      </div>

      <div style={{ padding: 'var(--sp-6)' }}>
        {/* Decision Buttons */}
        <div className="u-flex u-gap-4" style={{ marginBottom: 'var(--sp-6)' }}>
          <button
            className={`decision-btn decision-btn--confirm ${decision === 'confirm' ? 'decision-btn--active' : ''}`}
            onClick={() => setDecision('confirm')}
            disabled={submitted || submitting}
          >
            <span className="decision-btn__icon">✓</span>
            <span className="decision-btn__label">CONFIRM</span>
            <span className="decision-btn__desc">
              AI Grade {caseData.drGradeCnn} ({drGradeLabels[caseData.drGradeCnn]}) is correct
            </span>
            <span className="decision-btn__shortcut">Press C</span>
          </button>

          <button
            className={`decision-btn decision-btn--override ${decision === 'override' ? 'decision-btn--active' : ''}`}
            onClick={() => setDecision('override')}
            disabled={submitted || submitting}
          >
            <span className="decision-btn__icon">✕</span>
            <span className="decision-btn__label">OVERRIDE</span>
            <span className="decision-btn__desc">
              I disagree with the AI assessment
            </span>
            <span className="decision-btn__shortcut">Press O</span>
          </button>
        </div>

        {/* Override Form */}
        {decision === 'override' && (
          <div className="override-form" style={{ animation: 'fade-in-up 0.3s ease-out' }}>
            <div className="u-flex u-gap-4 u-mb-4">
              <div style={{ flex: 1 }}>
                <label className="label">OVERRIDE REASON</label>
                <select
                  className="select"
                  value={overrideCategory}
                  onChange={(e) => setOverrideCategory(e.target.value)}
                >
                  <option value="">Select reason...</option>
                  {overrideReasonCategories.map(cat => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label className="label">CORRECTED GRADE</label>
                <select
                  className="select"
                  value={overrideGrade}
                  onChange={(e) => setOverrideGrade(e.target.value)}
                >
                  <option value="">Select grade...</option>
                  {Object.entries(drGradeLabels).map(([g, label]) => (
                    <option key={g} value={g}>Grade {g} — {label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="u-mb-4">
              <label className="label">ADDITIONAL NOTES (OPTIONAL)</label>
              <textarea
                className="input"
                rows={3}
                value={overrideText}
                onChange={(e) => setOverrideText(e.target.value)}
                placeholder="Clinical reasoning for override..."
                style={{ resize: 'vertical' }}
              />
            </div>
          </div>
        )}

        {/* Submit */}
        {decision && (
          <button
            className={`btn btn--lg u-w-full ${decision === 'confirm' ? 'btn--success' : 'btn--danger'}`}
            onClick={handleSubmit}
            disabled={submitted || submitting || (decision === 'override' && !overrideCategory)}
            style={{ justifyContent: 'center', marginTop: 'var(--sp-2)' }}
          >
            <span>
              {submitting ? 'SUBMITTING...' : submitted ? '✓ SUBMITTED' : `SUBMIT ${decision.toUpperCase()}`}
            </span>
          </button>
        )}
      </div>
    </div>
  );
};
