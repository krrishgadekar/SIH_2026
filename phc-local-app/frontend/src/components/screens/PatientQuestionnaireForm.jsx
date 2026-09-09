import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export const PatientQuestionnaireForm = ({ value, onChange }) => {
  const { t } = useTranslation();
  const [data, setData] = useState({
    knownDiabetic: value?.knownDiabetic || false,
    yearsSinceDiagnosis: value?.yearsSinceDiagnosis || '',
    bloodPressure: value?.bloodPressure || 'none',
  });

  useEffect(() => {
    if (onChange) onChange(data);
  }, [data]);

  const handleChange = (field, val) =>
    setData(prev => ({ ...prev, [field]: val }));

  return (
    <div className="meta-card">
      <div className="meta-card__header">
        <h3 className="meta-card__title">CLINICAL QUESTIONNAIRE</h3>
      </div>

      <div className="meta-card__body">
        {/* Known Diabetic? */}
        <div className="meta-field meta-field--inline">
          <label className="meta-label">KNOWN DIABETIC?</label>
          <div
            className={`meta-toggle ${data.knownDiabetic ? 'meta-toggle--active' : ''}`}
            onClick={() => handleChange('knownDiabetic', !data.knownDiabetic)}
          >
            <div className="meta-toggle__track">
              <div className="meta-toggle__thumb" />
            </div>
          </div>
        </div>

        {data.knownDiabetic && (
          <div className="meta-field">
            <label className="meta-label">YEARS SINCE DIAGNOSIS</label>
            <input
              type="number"
              className="input meta-input"
              min="0"
              placeholder="e.g. 5"
              value={data.yearsSinceDiagnosis}
              onChange={(e) => handleChange('yearsSinceDiagnosis', e.target.value)}
            />
          </div>
        )}

        {/* Blood Pressure History */}
        <div className="meta-field">
          <label className="meta-label">BLOOD PRESSURE HISTORY</label>
          <div className="select-wrap">
            <select
              className="select meta-select"
              value={data.bloodPressure}
              onChange={(e) => handleChange('bloodPressure', e.target.value)}
            >
              <option value="none">None</option>
              <option value="normal">Normal</option>
              <option value="high">High (Hypertension)</option>
              <option value="low">Low (Hypotension)</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};
