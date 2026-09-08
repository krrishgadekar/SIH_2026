import React, { useState } from 'react';
import { RetinalWaveCanvas } from '../shared/RetinalWaveCanvas';

const ROLES = [
  {
    id: 'ophthalmologist',
    title: 'OPHTHALMOLOGIST',
    subtitle: 'Case Review & Diagnosis',
    description: 'Review AI-graded retinal scans, confirm or override diagnoses, and manage the review queue.',
    icon: '◉',
    stats: '6 cases pending',
  },
  {
    id: 'admin',
    title: 'DISTRICT ADMIN',
    subtitle: 'Analytics & Oversight',
    description: 'Monitor PHC performance, track referrals, view screening analytics, and manage district-wide operations.',
    icon: '⬡',
    stats: '42 cases today',
  },
];

export const LoginScreen = ({ onLogin }) => {
  const [hoveredRole, setHoveredRole] = useState(null);
  const [selectedRole, setSelectedRole] = useState(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const handleSelect = (roleId) => {
    setSelectedRole(roleId);
    setIsTransitioning(true);
    setTimeout(() => {
      onLogin(roleId);
    }, 800);
  };

  return (
    <div className="login-screen">
      <RetinalWaveCanvas />
      
      <div className="login-screen__content" style={{ position: 'relative', zIndex: 1 }}>
        {/* Hero Title */}
        <div className={`login-hero ${isTransitioning ? 'login-hero--exit' : ''}`}>
          <div className="login-hero__eyecon">
            <svg viewBox="0 0 120 120" width="120" height="120">
              <circle cx="60" cy="60" r="50" fill="none" stroke="var(--c-crimson)" strokeWidth="1" opacity="0.3" />
              <circle cx="60" cy="60" r="35" fill="none" stroke="var(--c-black)" strokeWidth="1.5" opacity="0.5" />
              <circle cx="60" cy="60" r="18" fill="var(--c-black)" opacity="0.9" />
              <circle cx="60" cy="60" r="6" fill="var(--c-crimson)" />
              {/* Retinal vessels */}
              <path d="M60 42 Q50 30 35 25" fill="none" stroke="var(--c-crimson-dark)" strokeWidth="0.8" opacity="0.6" />
              <path d="M60 42 Q70 30 85 25" fill="none" stroke="var(--c-crimson-dark)" strokeWidth="0.8" opacity="0.6" />
              <path d="M60 78 Q50 90 35 95" fill="none" stroke="var(--c-crimson-dark)" strokeWidth="0.8" opacity="0.6" />
              <path d="M60 78 Q70 90 85 95" fill="none" stroke="var(--c-crimson-dark)" strokeWidth="0.8" opacity="0.6" />
              <path d="M42 60 Q30 50 25 35" fill="none" stroke="var(--c-crimson-dark)" strokeWidth="0.6" opacity="0.4" />
              <path d="M78 60 Q90 50 95 35" fill="none" stroke="var(--c-crimson-dark)" strokeWidth="0.6" opacity="0.4" />
            </svg>
          </div>
          
          <h1 className="t-display" style={{ textAlign: 'center', marginBottom: 'var(--sp-3)' }}>
            RETINAL<span className="login-hero__star">✦</span>DIAGNOSTICS
          </h1>
          <p className="t-mono" style={{ textAlign: 'center', opacity: 0.6, marginBottom: 'var(--sp-2)' }}>
            EXPLAINABLE AI FOR DIABETIC RETINOPATHY
          </p>
          <p className="t-label" style={{ textAlign: 'center', opacity: 0.4 }}>
            CENTRAL REVIEW SYSTEM v1.0
          </p>
        </div>

        {/* Role Selection */}
        <div className="login-roles">
          <p className="t-label" style={{ textAlign: 'center', marginBottom: 'var(--sp-6)', opacity: 0.5 }}>
            SELECT YOUR ROLE TO PROCEED
          </p>
          
          <div className="login-roles__grid">
            {ROLES.map((role) => (
              <button
                key={role.id}
                className={`login-role-card ${hoveredRole === role.id ? 'login-role-card--hover' : ''} ${selectedRole === role.id ? 'login-role-card--selected' : ''}`}
                onMouseEnter={() => setHoveredRole(role.id)}
                onMouseLeave={() => setHoveredRole(null)}
                onClick={() => handleSelect(role.id)}
                disabled={isTransitioning}
              >
                <div className="login-role-card__icon">{role.icon}</div>
                <div className="login-role-card__title t-h2">{role.title}</div>
                <div className="login-role-card__subtitle t-mono">{role.subtitle}</div>
                <div className="login-role-card__desc t-body" style={{ marginTop: 'var(--sp-3)', opacity: 0.7, fontSize: 'var(--fs-small)' }}>
                  {role.description}
                </div>
                <div className="login-role-card__stats t-label" style={{ marginTop: 'var(--sp-4)' }}>
                  {role.stats}
                </div>
                <div className="login-role-card__arrow">→</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
