import React, { useState, useEffect } from 'react';
import { drGradeLabels, overrideReasonCategories } from '../../api/mockData';

export const DecisionControls = ({ caseData, onSubmit, submitted }) => {
  const [decision, setDecision] = useState(null); // 'confirm' | 'override'
  const [overrideGrade, setOverrideGrade] = useState('');
  const [overrideCategory, setOverrideCategory] = useState('');
  const [overrideText, setOverrideText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Live review SLA timer (< 30s target)
  useEffect(() => {
    if (submitted) return;
    const interval = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [submitted]);

  // Keyboard shortcut listener: Press C to confirm, O to override, Enter to submit
  useEffect(() => {
    if (submitted) return;
    const handleKeyDown = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        if (e.key === 'Enter' && e.ctrlKey) {
          handleSubmit();
        }
        return;
      }

      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        setDecision('confirm');
      } else if (e.key === 'o' || e.key === 'O') {
        e.preventDefault();
        setDecision('override');
      } else if (e.key === 'Enter' && decision) {
        e.preventDefault();
        handleSubmit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [submitted, decision, overrideCategory, overrideGrade, overrideText]);

  const handleSubmit = async () => {
    if (!decision) return;
    setSubmitting(true);

    const reviewData = {
      ophthalmologistId: 'OPHTH-001',
      decision,
      overrideReasonCategory: decision === 'override' ? overrideCategory : null,
      overrideReasonText: decision === 'override' && overrideText ? overrideText : null,
      // Without this, an override returns smsStatus: 'override_without_grade'
      // and the referral SMS is never sent (api-contracts.md) — the reviewer
      // picks a grade in the UI above, but it was never reaching the API.
      ...(decision === 'override' && overrideGrade !== ''
        ? { correctedGrade: Number(overrideGrade) }
        : {}),
      overrideGrade: decision === 'override' && overrideGrade ? parseInt(overrideGrade, 10) : null,
      reviewDurationSeconds: elapsedSeconds,
    };

    await onSubmit(reviewData);
    setSubmitting(false);
  };

  const timerFormatted = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:${String(elapsedSeconds % 60).padStart(2, '0')}`;

  return (
    <div className="decision-controls" style={{ border: 'var(--border)' }}>
      <div style={{
        padding: 'var(--sp-4) var(--sp-6)',
        borderBottom: 'var(--border)',
        background: 'var(--c-black)',
        color: 'var(--c-crimson)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '8px'
      }}>
        <h3 className="t-h3" style={{ margin: 0, color: 'var(--c-crimson)' }}>
          CLINICAL DECISION &amp; SAFETY AUDIT
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="t-mono" style={{
            fontSize: '11px',
            color: elapsedSeconds < 30 ? 'var(--c-success, #25a244)' : 'var(--c-warning, #ffaa00)',
            fontWeight: 700
          }}>
            ● REVIEW SLA: {timerFormatted} / &lt;30s TARGET
          </span>
          <span className="badge badge--pass" style={{ fontSize: '10px' }}>
            {elapsedSeconds < 30 ? 'SLA AUDIT PASS' : 'EXTENDED REVIEW'}
          </span>
        </div>
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
        {submitted ? (
          <div style={{
            marginTop: 'var(--sp-4)',
            padding: '16px',
            background: 'rgba(37, 162, 68, 0.12)',
            border: '2px solid var(--c-success, #25a244)',
            boxShadow: '3px 3px 0px #000',
            textAlign: 'center'
          }}>
            <div style={{ color: 'var(--c-success, #25a244)', fontWeight: 800, fontSize: '14px', fontFamily: 'var(--font-mono)' }}>
              ✓ CLINICAL DECISION AUDITED &amp; SIGNED
            </div>
            <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-h)' }}>
              Review completed in <strong>{elapsedSeconds} seconds</strong> (Target: &lt; 30s SLA). Audit log recorded by Dr. Krrish Gadekar. Returning to queue...
            </div>
          </div>
        ) : decision && (
          <button
            className={`btn btn--lg u-w-full ${decision === 'confirm' ? 'btn--success' : 'btn--danger'}`}
            onClick={handleSubmit}
            disabled={submitting || (decision === 'override' && !overrideCategory)}
            style={{ justifyContent: 'center', marginTop: 'var(--sp-2)' }}
          >
            <span>
              {submitting ? 'SUBMITTING CLINICAL AUDIT...' : `SUBMIT ${decision.toUpperCase()} (PRESS ENTER)`}
            </span>
          </button>
        )}
      </div>
    </div>
  );
};
