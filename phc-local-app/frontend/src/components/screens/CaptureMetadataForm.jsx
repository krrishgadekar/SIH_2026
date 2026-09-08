import React, { useState, useEffect } from 'react';
import { cameraDevices } from '../../api/mockData';

export const CaptureMetadataForm = ({ onChange }) => {
  const [data, setData] = useState({
    eye: 'right', // left, right
    cameraDeviceId: cameraDevices[0].id,
    pupilDilation: false,
    issuesNoticed: []
  });

  useEffect(() => {
    onChange(data);
  }, [data, onChange]);

  const handleChange = (field, value) => {
    setData(prev => ({ ...prev, [field]: value }));
  };

  const toggleIssue = (issue) => {
    setData(prev => {
      const issues = prev.issuesNoticed;
      if (issues.includes(issue)) {
        return { ...prev, issuesNoticed: issues.filter(i => i !== issue) };
      } else {
        return { ...prev, issuesNoticed: [...issues, issue] };
      }
    });
  };

  return (
    <div className="panel u-p-4">
      <h3 className="t-h3" style={{ color: 'var(--c-crimson)', marginBottom: 'var(--sp-4)' }}>CAPTURE METADATA</h3>
      
      <div className="u-mb-4">
        <label className="label">EYE SCANNED</label>
        <div className="u-flex" style={{ border: '1px solid var(--c-crimson)' }}>
          <div 
            className="u-p-2 u-text-center t-mono" 
            style={{ flex: 1, cursor: 'pointer', background: data.eye === 'left' ? 'var(--c-crimson)' : 'transparent', color: data.eye === 'left' ? 'var(--c-black)' : 'var(--c-crimson)' }}
            onClick={() => handleChange('eye', 'left')}
          >
            LEFT (OS)
          </div>
          <div 
            className="u-p-2 u-text-center t-mono" 
            style={{ flex: 1, cursor: 'pointer', background: data.eye === 'right' ? 'var(--c-crimson)' : 'transparent', color: data.eye === 'right' ? 'var(--c-black)' : 'var(--c-crimson)' }}
            onClick={() => handleChange('eye', 'right')}
          >
            RIGHT (OD)
          </div>
        </div>
      </div>

      <div className="u-mb-4">
        <label className="label">CAMERA DEVICE</label>
        <select 
          className="select input--on-dark" 
          value={data.cameraDeviceId} 
          onChange={(e) => handleChange('cameraDeviceId', e.target.value)}
        >
          {cameraDevices.map(cam => (
            <option key={cam.id} value={cam.id}>{cam.label}</option>
          ))}
        </select>
      </div>

      <div className="u-mb-4">
        <label className="label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          PUPIL DILATION ADMINISTERED
          <div className={`toggle ${data.pupilDilation ? 'toggle--active' : ''}`} onClick={() => handleChange('pupilDilation', !data.pupilDilation)}>
            <div className="toggle__track">
              <div className="toggle__thumb"></div>
            </div>
          </div>
        </label>
      </div>

      <div>
        <label className="label">OBSERVED ISSUES (OPTIONAL)</label>
        <div className="chip-group">
          {['Cataract Suspected', 'Small Pupil', 'Patient Uncooperative', 'Other'].map(issue => (
            <div 
              key={issue} 
              className={`chip ${data.issuesNoticed.includes(issue) ? 'selected' : ''}`}
              style={data.issuesNoticed.includes(issue) ? { background: 'var(--c-crimson)', color: 'var(--c-black)', borderColor: 'var(--c-crimson)' } : { borderColor: 'var(--c-crimson)', color: 'var(--c-crimson)' }}
              onClick={() => toggleIssue(issue)}
            >
              {issue}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
