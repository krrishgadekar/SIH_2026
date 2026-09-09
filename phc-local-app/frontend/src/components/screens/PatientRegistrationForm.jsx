import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { localApi } from '../../api/localApiClient';
import { RetinalWaveCanvas } from '../shared/RetinalWaveCanvas';

export const PatientRegistrationForm = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ name: '', age: '', contactNumber: '' });
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const newPatient = await localApi.registerPatient(formData);
      // In a real flow, we might pass the patient ID to the capture screen
      navigate(`/capture?patientId=${newPatient.patientId}`);
    } catch (err) {
      console.error(err);
      alert('Failed to register patient');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="registration-screen">
      <RetinalWaveCanvas />
      
      <div className="registration-screen__content">
        <h1 className="t-display u-text-center u-mb-6" dangerouslySetInnerHTML={{ __html: t('registration.title').replace(' ', '<br/>') }}></h1>
        
        <form onSubmit={handleSubmit} className="panel u-p-6">
          <div className="grid grid--2">
            <div className="panel u-p-4">
              <label className="label">{t('registration.fullName')}</label>
              <input 
                type="text" 
                name="name" 
                className="input" 
                placeholder={t('registration.namePlaceholder')}
                value={formData.name}
                onChange={handleChange}
                required 
              />
            </div>
            <div className="panel u-p-4">
              <label className="label">{t('registration.age')}</label>
              <input 
                type="number" 
                name="age" 
                className="input" 
                placeholder={t('registration.agePlaceholder')}
                value={formData.age}
                onChange={handleChange}
                required 
                min="0"
                max="120"
              />
            </div>
          </div>
          
          <div className="panel u-p-4 u-mt-0">
            <label className="label">{t('registration.contact')}</label>
            <input 
              type="tel" 
              name="contactNumber" 
              className="input" 
              placeholder={t('registration.contactPlaceholder')}
              value={formData.contactNumber}
              onChange={handleChange}
            />
          </div>

          <div className="panel u-p-4 u-text-right">
            <button type="submit" className="btn btn--lg" disabled={loading}>
              <span>{loading ? t('registration.btnRegistering') : t('registration.btnInitiate')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
