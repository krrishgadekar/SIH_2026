import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { cameraDevices } from '../../api/mockData';

export const CaptureMetadataForm = ({ value, onChange }) => {
  const { t } = useTranslation();
  const [data, setData] = useState({
    eye: value?.eye || 'right',
    cameraDeviceId: value?.cameraDeviceId || cameraDevices[0].id,
    pupilDilation: value?.pupilDilation || false,
    issuesNoticed: value?.issuesNoticed || []
  });

  useEffect(() => {
    if (onChange) onChange(data);
  }, [data]);

  const handleChange = (field, val) =>
    setData(prev => ({ ...prev, [field]: val }));

  const toggleIssue = (issue) =>
    setData(prev => {
      const issues = prev.issuesNoticed;
      return {
        ...prev,
        issuesNoticed: issues.includes(issue)
          ? issues.filter(i => i !== issue)
          : [...issues, issue],
      };
    });

  return (
    <div className="meta-card">
      <div className="meta-card__header">
        <h3 className="meta-card__title">CAPTURE METADATA</h3>
      </div>

      <div className="meta-card__body">
        {/* Eye Scanned */}
        <div className="meta-field">
          <label className="meta-label">EYE SCANNED</label>
          <div className="meta-eye-toggle">
            <button
              type="button"
              className={`meta-eye-btn ${data.eye === 'left' ? 'meta-eye-btn--active' : ''}`}
              onClick={() => handleChange('eye', 'left')}
            >
              LEFT (OS)
            </button>
            <button
              type="button"
              className={`meta-eye-btn ${data.eye === 'right' ? 'meta-eye-btn--active' : ''}`}
              onClick={() => handleChange('eye', 'right')}
            >
              RIGHT (OD)
            </button>
          </div>
        </div>

        {/* Camera Device */}
        <div className="meta-field">
          <label className="meta-label">CAMERA DEVICE</label>
          <div className="select-wrap">
            <select
              className="select meta-select"
              value={data.cameraDeviceId}
              onChange={(e) => handleChange('cameraDeviceId', e.target.value)}
            >
              {cameraDevices.map(cam => (
                <option key={cam.id} value={cam.id}>{cam.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Pupil Dilation Administered */}
        <div className="meta-field meta-field--inline">
          <label className="meta-label">PUPIL DILATION ADMINISTERED</label>
          <div
            className={`meta-toggle ${data.pupilDilation ? 'meta-toggle--active' : ''}`}
            onClick={() => handleChange('pupilDilation', !data.pupilDilation)}
          >
            <div className="meta-toggle__track">
              <div className="meta-toggle__thumb" />
            </div>
          </div>
        </div>

        {/* Observed Issues */}
        <div className="meta-field">
          <label className="meta-label">OBSERVED ISSUES (OPTIONAL)</label>
          <div className="meta-chip-grid">
            {['CATARACT SUSPECTED', 'SMALL PUPIL', 'PATIENT UNCOOPERATIVE', 'OTHER'].map(issue => (
              <button
                key={issue}
                type="button"
                className={`meta-chip ${data.issuesNoticed.includes(issue) ? 'meta-chip--active' : ''}`}
                onClick={() => toggleIssue(issue)}
              >
                {issue}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
