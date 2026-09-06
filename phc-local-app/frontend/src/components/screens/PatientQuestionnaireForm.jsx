import React, { useState, useEffect } from 'react';

export const PatientQuestionnaireForm = ({ onChange }) => {
  const [data, setData] = useState({
    knownDiabetic: false,
    yearsSinceDiagnosis: '',
    bloodPressure: 'normal', // normal, high, low, unknown
    visionChanges: false
  });

  useEffect(() => {
    onChange(data);
  }, [data, onChange]);

  const handleChange = (field, value) => {
    setData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="panel u-p-4">
      <h3 className="t-h3" style={{ color: 'var(--c-crimson)', marginBottom: 'var(--sp-4)' }}>CLINICAL QUESTIONNAIRE</h3>
      
      <div className="u-mb-4">
        <label className="label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          KNOWN DIABETIC?
          <div className={`toggle ${data.knownDiabetic ? 'toggle--active' : ''}`} onClick={() => handleChange('knownDiabetic', !data.knownDiabetic)}>
            <div className="toggle__track">
              <div className="toggle__thumb"></div>
            </div>
          </div>
        </label>
      </div>

      {data.knownDiabetic && (
        <div className="u-mb-4">
          <label className="label">YEARS SINCE DIAGNOSIS</label>
          <input 
            type="number" 
            className="input input--on-dark" 
            min="0"
            placeholder="e.g. 5"
            value={data.yearsSinceDiagnosis}
            onChange={(e) => handleChange('yearsSinceDiagnosis', e.target.value)}
          />
        </div>
      )}

      <div className="u-mb-4">
        <label className="label">BLOOD PRESSURE HISTORY</label>
        <select 
          className="select input--on-dark" 
          value={data.bloodPressure} 
          onChange={(e) => handleChange('bloodPressure', e.target.value)}
        >
          <option value="unknown">Unknown / Not measured</option>
          <option value="normal">Normal</option>
          <option value="high">High (Hypertension)</option>
          <option value="low">Low (Hypotension)</option>
        </select>
      </div>

      <div>
        <label className="label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          RECENT VISION CHANGES? (BLURRINESS, SPOTS)
          <div className={`toggle ${data.visionChanges ? 'toggle--active' : ''}`} onClick={() => handleChange('visionChanges', !data.visionChanges)}>
            <div className="toggle__track">
              <div className="toggle__thumb"></div>
            </div>
          </div>
        </label>
      </div>
    </div>
  );
};
