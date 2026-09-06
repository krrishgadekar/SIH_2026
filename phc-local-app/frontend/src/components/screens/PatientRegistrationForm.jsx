import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { localApi } from '../../api/localApiClient';
import { RetinalWaveCanvas } from '../shared/RetinalWaveCanvas';

export const PatientRegistrationForm = () => {
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
    <div className="section" style={{ position: 'relative' }}>
      <RetinalWaveCanvas />
      
      <div style={{ position: 'relative', zIndex: 1, maxWidth: '600px', margin: '0 auto', marginTop: '4rem' }}>
        <h1 className="t-display u-text-center u-mb-6">REGISTER <br/>PATIENT</h1>
        
        <form onSubmit={handleSubmit} className="panel u-p-6">
          <div className="grid grid--2">
            <div className="panel u-p-4">
              <label className="label">Full Name</label>
              <input 
                type="text" 
                name="name" 
                className="input" 
                placeholder="e.g. Sunita Devi" 
                value={formData.name}
                onChange={handleChange}
                required 
              />
            </div>
            <div className="panel u-p-4">
              <label className="label">Age</label>
              <input 
                type="number" 
                name="age" 
                className="input" 
                placeholder="e.g. 54" 
                value={formData.age}
                onChange={handleChange}
                required 
                min="0"
                max="120"
              />
            </div>
          </div>
          
          <div className="panel u-p-4 u-mt-0">
            <label className="label">Contact Number (Optional)</label>
            <input 
              type="tel" 
              name="contactNumber" 
              className="input" 
              placeholder="+91..." 
              value={formData.contactNumber}
              onChange={handleChange}
            />
          </div>

          <div className="panel u-p-4 u-text-right">
            <button type="submit" className="btn btn--lg" disabled={loading}>
              <span>{loading ? 'REGISTERING...' : 'INITIATE CAPTURE ✦'}</span>
            </button>
          </div>
        </form>
        
        <div className="u-text-center u-mt-4">
          <p className="t-mono" style={{ opacity: 0.5 }}>SECURE OFFLINE MODULE V1.2.0</p>
        </div>
      </div>
    </div>
  );
};
