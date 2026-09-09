import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export const PatientQuestionnaireForm = ({ onChange }) => {
  const { t } = useTranslation();
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
      <h3 className="t-h3" style={{ color: 'var(--c-crimson)', marginBottom: 'var(--sp-4)' }}>{t('questionnaire.title')}</h3>
      
      <div className="u-mb-4">
        <label className="label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {t('questionnaire.knownDiabetic')}
          <div className={`toggle ${data.knownDiabetic ? 'toggle--active' : ''}`} onClick={() => handleChange('knownDiabetic', !data.knownDiabetic)}>
            <div className="toggle__track">
              <div className="toggle__thumb"></div>
            </div>
          </div>
        </label>
      </div>

      {data.knownDiabetic && (
        <div className="u-mb-4">
          <label className="label">{t('questionnaire.yearsSince')}</label>
          <input 
            type="number" 
            className="input input--on-dark" 
            min="0"
            placeholder={t('questionnaire.yearsPlaceholder')}
            value={data.yearsSinceDiagnosis}
            onChange={(e) => handleChange('yearsSinceDiagnosis', e.target.value)}
          />
        </div>
      )}

      <div className="u-mb-4">
        <label className="label">{t('questionnaire.bpHistory')}</label>
        <select 
          className="select input--on-dark" 
          value={data.bloodPressure} 
          onChange={(e) => handleChange('bloodPressure', e.target.value)}
        >
          <option value="unknown">{t('questionnaire.bpOptions.unknown')}</option>
          <option value="normal">{t('questionnaire.bpOptions.normal')}</option>
          <option value="high">{t('questionnaire.bpOptions.high')}</option>
          <option value="low">{t('questionnaire.bpOptions.low')}</option>
        </select>
      </div>

      <div>
        <label className="label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {t('questionnaire.visionChanges')}
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
