import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { InfoBanner } from '../shared/InfoBanner';

const mockPatientData = {
  id: 'PT-1099-B',
  name: 'Anita S.',
  age: 62,
  history: [
    {
      id: 'V-03',
      date: '2026-09-08',
      grade: '3 / SEVERE NPDR',
      status: 'CONFIRMED',
      lesions: {
        microaneurysms: 12,
        hemorrhages: 5,
        hardExudates: 2,
        softExudates: 1
      },
      image: 'https://images.unsplash.com/photo-1616012480717-fd9867059ca0?auto=format&fit=crop&q=80&w=200',
      referralStatus: 'Contacted' // Referred -> Contacted -> Scheduled -> Seen
    },
    {
      id: 'V-02',
      date: '2025-08-14',
      grade: '2 / MODERATE NPDR',
      status: 'CONFIRMED',
      lesions: {
        microaneurysms: 8,
        hemorrhages: 1,
        hardExudates: 0,
        softExudates: 0
      },
      image: 'https://images.unsplash.com/photo-1616012480717-fd9867059ca0?auto=format&fit=crop&q=80&w=200',
      referralStatus: 'Seen'
    },
    {
      id: 'V-01',
      date: '2024-07-02',
      grade: '1 / MILD NPDR',
      status: 'OVERRIDDEN (AI: 0)',
      lesions: {
        microaneurysms: 2,
        hemorrhages: 0,
        hardExudates: 0,
        softExudates: 0
      },
      image: 'https://images.unsplash.com/photo-1616012480717-fd9867059ca0?auto=format&fit=crop&q=80&w=200',
      referralStatus: 'Seen'
    }
  ]
};

const ReferralTracker = ({ status }) => {
  const steps = ['Referred', 'Contacted', 'Scheduled', 'Seen'];
  const currentIndex = steps.indexOf(status);

  return (
    <div className="u-flex u-items-center u-gap-2 u-mt-2">
      {steps.map((step, idx) => (
        <div key={step} className="u-flex u-items-center u-gap-2">
          <div style={{
            width: '12px', height: '12px', borderRadius: '50%',
            backgroundColor: idx <= currentIndex ? 'var(--c-crimson)' : 'transparent',
            border: '2px solid var(--c-crimson)'
          }} />
          <span className="t-mono" style={{ fontSize: '10px', opacity: idx <= currentIndex ? 1 : 0.5 }}>
            {step.toUpperCase()}
          </span>
          {idx < steps.length - 1 && (
            <div style={{ width: '20px', height: '2px', backgroundColor: 'var(--c-crimson)', opacity: 0.3 }} />
          )}
        </div>
      ))}
    </div>
  );
};

export const PatientTimelinePage = () => {
  const [diffView, setDiffView] = useState(false);
  const patient = mockPatientData;

  const renderLesions = (current, previous) => {
    return (
      <div className="grid--2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-2)' }}>
        {Object.entries(current).map(([key, val]) => {
          const prevVal = previous ? previous[key] : 0;
          const diff = val - prevVal;
          const label = key.replace(/([A-Z])/g, ' $1').toUpperCase();

          let diffColor = 'inherit';
          let diffText = '';

          if (diffView && previous) {
            if (diff > 0) {
              diffColor = 'var(--c-danger)';
              diffText = ` (+${diff})`;
            } else if (diff < 0) {
              diffColor = 'var(--c-success)';
              diffText = ` (${diff})`;
            } else {
              diffColor = 'inherit';
              diffText = ' (0)';
            }
          }

          return (
            <div key={key} className="u-flex u-justify-between u-items-center" style={{ padding: 'var(--sp-2)', border: '1px solid var(--border)' }}>
              <span className="t-mono" style={{ fontSize: '12px', opacity: 0.8 }}>{label}</span>
              <span className="t-mono" style={{ fontWeight: 700, color: diffView && previous ? diffColor : 'inherit' }}>
                {val} {diffText}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="section">
      <div className="u-flex u-justify-between u-items-center u-mb-6">
        <div>
          <h1 className="t-h1 u-mb-2">PATIENT TIMELINE</h1>
          <div className="t-mono" style={{ opacity: 0.8 }}>
            REF: {patient.id} • {patient.name} ({patient.age}Y)
          </div>
        </div>
        <button 
          className={`btn ${diffView ? 'btn--danger' : 'btn--outline'}`}
          onClick={() => setDiffView(!diffView)}
        >
          {diffView ? 'DISABLE DIFF VIEW' : 'ENABLE DIFF VIEW'}
        </button>
      </div>

      <InfoBanner 
        title="PATIENT HISTORY & COMPARISON" 
        text="Review the longitudinal visit history for this patient. Enable Diff View to automatically highlight changes in lesion evidence between adjacent visits. Track the referral progress loop across different nodes." 
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>
        {patient.history.map((visit, index) => {
          const previousVisit = patient.history[index + 1];
          return (
            <div key={visit.id} className="panel u-p-6" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <div className="u-flex u-justify-between u-items-start u-mb-4">
                <div className="u-flex u-gap-4">
                  <div style={{ width: '120px', height: '120px', border: '1px solid var(--c-crimson)', overflow: 'hidden' }}>
                    <img src={visit.image} alt="Fundus" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }} />
                  </div>
                  <div>
                    <div className="t-mono u-mb-2" style={{ opacity: 0.6 }}>VISIT DATE: {visit.date}</div>
                    <div className="t-h3 u-mb-2">{visit.grade}</div>
                    <div className="badge badge--success u-mb-4">{visit.status}</div>
                    
                    <div className="t-mono u-mb-2" style={{ fontSize: '10px', opacity: 0.6 }}>REFERRAL STATUS</div>
                    <ReferralTracker status={visit.referralStatus} />
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 'var(--sp-4)', borderTop: '1px solid var(--border)', paddingTop: 'var(--sp-4)' }}>
                <div className="t-label u-mb-2">LESION EVIDENCE {diffView && previousVisit ? '(VS PREVIOUS)' : ''}</div>
                {renderLesions(visit.lesions, previousVisit?.lesions)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
