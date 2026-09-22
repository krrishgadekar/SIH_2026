import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export const PatientQuestionnaireForm = ({ value, onChange, patientAge }) => {
  const { t } = useTranslation();
  
  // Patient could be pregnant if age is unspecified or under 55
  const parsedAge = Number(patientAge);
  const couldBePregnant = !patientAge || isNaN(parsedAge) || parsedAge < 55;

  const [data, setData] = useState({
    knownDiabetic: value?.knownDiabetic ?? false,
    yearsSinceDiagnosis: value?.yearsSinceDiagnosis || '1to5',
    glycemicControl: value?.glycemicControl || 'moderate',
    bloodPressure: value?.bloodPressure || 'normal',
    pregnancy: value?.pregnancy || 'not_applicable',
    blurredVision: value?.blurredVision ?? false,
    floaters: value?.floaters ?? false,
    suddenVisionChange: value?.suddenVisionChange ?? false,
    eyePain: value?.eyePain ?? false,
  });

  useEffect(() => {
    if (onChange) onChange(data);
  }, [data]);

  const handleChange = (field, val) =>
    setData(prev => ({ ...prev, [field]: val }));

  const toggleSymptom = (field) =>
    setData(prev => ({ ...prev, [field]: !prev[field] }));

  return (
    <div className="meta-card" style={{ overflowY: 'auto' }}>
      <div className="meta-card__header">
        <h3 className="meta-card__title">CLINICAL SYMPTOM & RISK QUESTIONNAIRE</h3>
      </div>

      <div className="meta-card__body" style={{ gap: '6px', padding: '8px 0' }}>
        {/* Known Diabetic? */}
        <div className="meta-field meta-field--inline">
          <label className="meta-label">KNOWN DIABETIC?</label>
          <div
            className={`meta-toggle ${data.knownDiabetic ? 'meta-toggle--active' : ''}`}
            onClick={() => handleChange('knownDiabetic', !data.knownDiabetic)}
            role="switch"
            aria-checked={data.knownDiabetic}
            tabIndex={0}
          >
            <div className="meta-toggle__track">
              <div className="meta-toggle__thumb" />
            </div>
          </div>
        </div>

        {/* Years Since Diagnosis (conditional on diabetic status) */}
        {data.knownDiabetic && (
          <div className="meta-field">
            <label className="meta-label">YEARS SINCE DIAGNOSIS</label>
            <div className="meta-chip-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
              {[
                { id: 'lt1', label: '< 1 YR' },
                { id: '1to5', label: '1–5 YRS' },
                { id: '5to10', label: '5–10 YRS' },
                { id: 'gt10', label: '> 10 YRS' },
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  className={`meta-chip ${data.yearsSinceDiagnosis === opt.id ? 'meta-chip--active' : ''}`}
                  onClick={() => handleChange('yearsSinceDiagnosis', opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Glycemic Control (HbA1c status) */}
        <div className="meta-field">
          <label className="meta-label">GLYCEMIC CONTROL (BLOOD SUGAR)</label>
          <div className="meta-chip-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
            {[
              { id: 'good', label: 'GOOD' },
              { id: 'moderate', label: 'MODERATE' },
              { id: 'poor', label: 'POOR' },
            ].map(opt => (
              <button
                key={opt.id}
                type="button"
                className={`meta-chip ${data.glycemicControl === opt.id ? 'meta-chip--active' : ''}`}
                onClick={() => handleChange('glycemicControl', opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Blood Pressure History */}
        <div className="meta-field">
          <label className="meta-label">BLOOD PRESSURE STATUS</label>
          <div className="select-wrap">
            <select
              className="select meta-select"
              value={data.bloodPressure}
              onChange={(e) => handleChange('bloodPressure', e.target.value)}
            >
              <option value="normal">Normal</option>
              <option value="high">High (Hypertension)</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>
        </div>

        {/* Pregnancy Status (conditional if age < 55) */}
        {couldBePregnant && (
          <div className="meta-field">
            <label className="meta-label">CURRENTLY PREGNANT?</label>
            <div className="meta-chip-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
              {[
                { id: 'yes', label: 'YES' },
                { id: 'no', label: 'NO' },
                { id: 'not_applicable', label: 'N / A' },
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  className={`meta-chip ${data.pregnancy === opt.id ? 'meta-chip--active' : ''}`}
                  onClick={() => handleChange('pregnancy', opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 4 Eye Symptom Toggles */}
        <div className="meta-field">
          <label className="meta-label">CURRENT EYE SYMPTOMS (SELECT ALL THAT APPLY)</label>
          <div className="meta-chip-grid" style={{ gap: '4px' }}>
            {[
              { id: 'blurredVision', label: 'BLURRED VISION' },
              { id: 'floaters', label: 'FLOATERS' },
              { id: 'suddenVisionChange', label: 'SUDDEN VISION CHANGE' },
              { id: 'eyePain', label: 'EYE PAIN' },
            ].map(sym => (
              <button
                key={sym.id}
                type="button"
                className={`meta-chip ${data[sym.id] ? 'meta-chip--active' : ''}`}
                onClick={() => toggleSymptom(sym.id)}
              >
                {data[sym.id] ? '✓ ' : ''}{sym.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
