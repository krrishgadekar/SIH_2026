import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { InfoBanner } from '../shared/InfoBanner';

// Inline SVG retinal fundus component — severity controls how many lesion markers appear
const FundusSvg = ({ severity = 1 }) => {
  return (
    <svg viewBox="0 0 200 200" width="100%" height="100%" style={{ background: '#1A0A05', display: 'block' }}>
      {/* Retinal background glow */}
      <defs>
        <radialGradient id={`fundus-bg-${severity}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#8B3A1A" stopOpacity="0.6" />
          <stop offset="45%" stopColor="#4A1A08" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#1A0A05" stopOpacity="1" />
        </radialGradient>
        <radialGradient id={`optic-disc-${severity}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFE8B0" stopOpacity="0.95" />
          <stop offset="70%" stopColor="#FFCC70" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#CC8833" stopOpacity="0.3" />
        </radialGradient>
      </defs>

      {/* Retinal field */}
      <circle cx="100" cy="100" r="90" fill={`url(#fundus-bg-${severity})`} />

      {/* Major Blood Vessels — arterial (brighter red) */}
      <path d="M130 85 Q140 70 155 50 Q162 38 170 25" fill="none" stroke="#C44430" strokeWidth="3.5" strokeLinecap="round" opacity="0.85" />
      <path d="M130 85 Q145 90 165 95 Q175 97 185 100" fill="none" stroke="#C44430" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
      <path d="M130 115 Q145 120 160 135 Q170 148 175 160" fill="none" stroke="#C44430" strokeWidth="3.2" strokeLinecap="round" opacity="0.82" />
      <path d="M130 115 Q140 130 150 155 Q155 168 158 178" fill="none" stroke="#B33825" strokeWidth="2.8" strokeLinecap="round" opacity="0.75" />

      {/* Major Blood Vessels — venous (darker) */}
      <path d="M130 90 Q148 75 160 60 Q168 48 172 35" fill="none" stroke="#882218" strokeWidth="4" strokeLinecap="round" opacity="0.7" />
      <path d="M130 110 Q150 115 170 110 Q180 108 190 105" fill="none" stroke="#882218" strokeWidth="3.5" strokeLinecap="round" opacity="0.65" />
      <path d="M130 110 Q145 125 155 145 Q162 160 168 175" fill="none" stroke="#882218" strokeWidth="3.8" strokeLinecap="round" opacity="0.68" />

      {/* Secondary vessel branches */}
      <path d="M155 50 Q160 42 168 30" fill="none" stroke="#AA3828" strokeWidth="1.8" strokeLinecap="round" opacity="0.6" />
      <path d="M165 95 Q172 90 180 82" fill="none" stroke="#AA3828" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <path d="M160 135 Q168 140 178 148" fill="none" stroke="#993322" strokeWidth="1.8" strokeLinecap="round" opacity="0.55" />
      <path d="M150 155 Q148 165 145 178" fill="none" stroke="#993322" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />

      {/* Left-side vessel branches */}
      <path d="M130 90 Q115 75 100 55 Q90 42 78 30" fill="none" stroke="#C44430" strokeWidth="2.5" strokeLinecap="round" opacity="0.65" />
      <path d="M130 95 Q110 90 90 92 Q75 93 55 97" fill="none" stroke="#882218" strokeWidth="2.8" strokeLinecap="round" opacity="0.5" />
      <path d="M130 110 Q110 115 90 125 Q75 133 60 145" fill="none" stroke="#C44430" strokeWidth="2.2" strokeLinecap="round" opacity="0.6" />
      <path d="M130 108 Q115 120 100 140 Q88 155 75 170" fill="none" stroke="#882218" strokeWidth="2.5" strokeLinecap="round" opacity="0.5" />

      {/* Optic disc */}
      <circle cx="130" cy="100" r="16" fill={`url(#optic-disc-${severity})`} stroke="#DDAA55" strokeWidth="0.5" opacity="0.9" />
      <circle cx="130" cy="100" r="6" fill="#FFFFFF" opacity="0.2" />

      {/* Macula / Fovea */}
      <circle cx="85" cy="100" r="12" fill="#2A0D05" opacity="0.5" />
      <circle cx="85" cy="100" r="5" fill="#1A0805" opacity="0.6" />

      {/* Lesion markers — severity-dependent */}
      {severity >= 1 && (
        <>
          {/* Microaneurysms — tiny red dots */}
          <circle cx="72" cy="88" r="2" fill="#FF4444" opacity="0.8" />
          <circle cx="78" cy="112" r="1.5" fill="#FF4444" opacity="0.7" />
        </>
      )}

      {severity >= 2 && (
        <>
          {/* More microaneurysms + small hemorrhages */}
          <circle cx="65" cy="95" r="2.5" fill="#DD2222" opacity="0.75" />
          <circle cx="90" cy="80" r="2" fill="#FF4444" opacity="0.7" />
          <circle cx="60" cy="108" r="3" fill="#CC1111" opacity="0.6" />
          <circle cx="95" cy="118" r="2" fill="#FF3333" opacity="0.65" />
          <circle cx="70" cy="75" r="1.8" fill="#FF4444" opacity="0.6" />
        </>
      )}

      {severity >= 3 && (
        <>
          {/* Hard exudates (yellowish), more hemorrhages */}
          <circle cx="75" cy="92" r="4" fill="#BB1111" opacity="0.55" />
          <circle cx="55" cy="100" r="3.5" fill="#AA0000" opacity="0.5" />
          <circle cx="80" cy="120" r="3" fill="#CC2222" opacity="0.6" />
          <circle cx="62" cy="85" r="2.5" fill="#FFDD88" opacity="0.5" />
          <circle cx="90" cy="110" r="2" fill="#FFCC66" opacity="0.45" />
          <circle cx="68" cy="115" r="2.2" fill="#FFDD88" opacity="0.5" />
          {/* Cotton wool spots */}
          <ellipse cx="55" cy="88" rx="5" ry="3" fill="#FFFFFF" opacity="0.15" />
        </>
      )}

      {severity >= 4 && (
        <>
          {/* Neovascularization — irregular branching vessels */}
          <path d="M75 95 Q68 88 62 82 Q58 78 55 72" fill="none" stroke="#FF3322" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
          <path d="M75 95 Q70 100 65 108 Q60 115 55 120" fill="none" stroke="#FF3322" strokeWidth="1" strokeLinecap="round" opacity="0.6" />
          <path d="M62 82 Q58 80 52 78" fill="none" stroke="#FF2211" strokeWidth="0.8" strokeLinecap="round" opacity="0.5" />
          <circle cx="50" cy="95" r="5" fill="#990000" opacity="0.3" />
        </>
      )}

      {/* Circular crop border */}
      <circle cx="100" cy="100" r="90" fill="none" stroke="#C42B2B" strokeWidth="1" opacity="0.3" />
    </svg>
  );
};

const mockPatientData = {
  id: 'PT-1099-B',
  name: 'Anita S.',
  age: 62,
  history: [
    {
      id: 'V-03',
      date: '2026-09-08',
      grade: '3 / SEVERE NPDR',
      gradeNum: 3,
      status: 'CONFIRMED',
      lesions: {
        microaneurysms: 12,
        hemorrhages: 5,
        hardExudates: 2,
        softExudates: 1
      },
      referralStatus: 'Contacted'
    },
    {
      id: 'V-02',
      date: '2025-08-14',
      grade: '2 / MODERATE NPDR',
      gradeNum: 2,
      status: 'CONFIRMED',
      lesions: {
        microaneurysms: 8,
        hemorrhages: 1,
        hardExudates: 0,
        softExudates: 0
      },
      referralStatus: 'Seen'
    },
    {
      id: 'V-01',
      date: '2024-07-02',
      grade: '1 / MILD NPDR',
      gradeNum: 1,
      status: 'OVERRIDDEN (AI: 0)',
      lesions: {
        microaneurysms: 2,
        hemorrhages: 0,
        hardExudates: 0,
        softExudates: 0
      },
      referralStatus: 'Seen'
    }
  ]
};

const ReferralTracker = ({ status }) => {
  const { t } = useTranslation();
  const steps = [
    t('central.timeline.steps.referred', 'REFERRED'), 
    t('central.timeline.steps.contacted', 'CONTACTED'), 
    t('central.timeline.steps.scheduled', 'SCHEDULED'), 
    t('central.timeline.steps.seen', 'SEEN')
  ];
  const currentIndex = steps.findIndex(s => s.toLowerCase() === status.toLowerCase());

  return (
    <div className="u-flex u-items-center u-gap-2 u-mt-2">
      {steps.map((step, idx) => (
        <div key={step} className="u-flex u-items-center u-gap-2">
          <div style={{
            width: '12px', height: '12px', borderRadius: '50%',
            backgroundColor: idx <= currentIndex ? 'var(--c-crimson)' : 'transparent',
            border: '2px solid var(--c-crimson)',
            transition: 'background-color 0.3s ease',
          }} />
          <span className="t-mono" style={{ fontSize: '10px', opacity: idx <= currentIndex ? 1 : 0.5 }}>
            {step.toUpperCase()}
          </span>
          {idx < steps.length - 1 && (
            <div style={{ 
              width: '20px', height: '2px', 
              backgroundColor: 'var(--c-crimson)', 
              opacity: idx < currentIndex ? 0.6 : 0.2,
              transition: 'opacity 0.3s ease',
            }} />
          )}
        </div>
      ))}
    </div>
  );
};

export const PatientTimelinePage = () => {
  const { t } = useTranslation();
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
              diffColor = 'var(--c-danger, #C42B2B)';
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
            <div key={key} className="u-flex u-justify-between u-items-center" style={{ padding: 'var(--sp-2)', border: '1px solid var(--c-border)' }}>
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
          <p className="section__subtitle">{t('central.timeline.subtitle', 'OPHTHALMOLOGIST INTERFACE')}</p>
          <h1 className="section__title" style={{ marginBottom: 'var(--sp-2)' }}>{t('central.timeline.title', 'PATIENT TIMELINE')}</h1>
          <div className="t-mono" style={{ opacity: 0.8 }}>
            {t('central.timeline.ref', 'REF:')} {patient.id} • {patient.name} ({patient.age}Y)
          </div>
        </div>
        <button 
          className={`btn ${diffView ? 'btn--primary' : 'btn--outline'}`}
          onClick={() => setDiffView(!diffView)}
          style={diffView ? { boxShadow: '3px 3px 0px #000' } : {}}
        >
          {diffView ? t('central.timeline.disableDiff', '◆ DIFF VIEW ON') : t('central.timeline.enableDiff', 'ENABLE DIFF VIEW')}
        </button>
      </div>

      <InfoBanner 
        title={t('central.timeline.banner.title', 'PATIENT HISTORY & COMPARISON')}
        text={t('central.timeline.banner.text', 'Review the longitudinal visit history for this patient. Enable Diff View to automatically highlight changes in lesion evidence between adjacent visits. Track the referral progress loop across different nodes.')}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>
        {patient.history.map((visit, index) => {
          const previousVisit = patient.history[index + 1];
          const isLatest = index === 0;
          return (
            <div 
              key={visit.id} 
              className="panel u-p-6" 
              style={{ 
                background: 'var(--bg)', 
                border: isLatest ? '2px solid var(--c-crimson)' : '1px solid var(--c-border)',
                boxShadow: isLatest ? 'var(--shadow-crimson)' : 'none',
                position: 'relative',
              }}
            >
              {isLatest && (
                <div style={{
                  position: 'absolute',
                  top: '-1px',
                  right: 'var(--sp-4)',
                  background: 'var(--c-crimson)',
                  color: '#FFF',
                  padding: '2px 12px',
                  fontSize: 'var(--fs-tiny)',
                  fontFamily: 'var(--f-mono)',
                  fontWeight: 700,
                  letterSpacing: '0.5px',
                }}>
                  {t('central.timeline.latestVisit', 'LATEST VISIT')}
                </div>
              )}

              <div className="u-flex u-justify-between u-items-start u-mb-4">
                <div className="u-flex u-gap-4">
                  <div style={{ 
                    width: '140px', 
                    height: '140px', 
                    border: '2px solid var(--c-crimson)', 
                    overflow: 'hidden',
                    boxShadow: 'var(--shadow-sm)',
                    flexShrink: 0,
                  }}>
                    <FundusSvg severity={visit.gradeNum} />
                  </div>
                  <div>
                    <div className="t-mono u-mb-1" style={{ opacity: 0.5, fontSize: 'var(--fs-tiny)' }}>
                      {t('central.timeline.visitId', 'VISIT ID')}: {visit.id} • {visit.date}
                    </div>
                    <div className="t-h3 u-mb-2" style={{ fontWeight: 800 }}>{visit.grade}</div>
                    <div className={`badge ${visit.status.includes('OVERRIDDEN') ? 'badge--warning' : 'badge--pass'}`}>
                      {visit.status}
                    </div>
                    
                    <div className="u-mt-4">
                      <div className="t-mono u-mb-1" style={{ fontSize: '10px', opacity: 0.5, letterSpacing: '1px' }}>{t('central.timeline.referralStatus', 'REFERRAL STATUS')}</div>
                      <ReferralTracker status={visit.referralStatus} />
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 'var(--sp-4)', borderTop: '1px solid var(--c-border)', paddingTop: 'var(--sp-4)' }}>
                <div className="t-label u-mb-2">{t('central.timeline.lesionEvidence', 'LESION EVIDENCE')} {diffView && previousVisit ? t('central.timeline.vsPrevious', '(VS PREVIOUS)') : ''}</div>
                {renderLesions(visit.lesions, previousVisit?.lesions)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
