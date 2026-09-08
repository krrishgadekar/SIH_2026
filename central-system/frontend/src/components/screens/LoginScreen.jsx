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
  const [authStep, setAuthStep] = useState('role_selection');
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [error, setError] = useState('');

  const handleSelect = (roleId) => {
    if (roleId === 'admin') {
      setIsTransitioning(true);
      setTimeout(() => {
        onLogin('admin', 'Admin');
      }, 800);
      return;
    }
    setSelectedRole(roleId);
    setAuthStep('credentials');
    setError('');
    setCredentials({ username: '', password: '' });
  };

  const handleBack = () => {
    setAuthStep('role_selection');
    setSelectedRole(null);
    setError('');
  };

  const handleLoginSubmit = (e) => {
    e.preventDefault();
    if (credentials.username.trim() !== '' && credentials.password.trim() !== '') {
      setIsTransitioning(true);
      setTimeout(() => {
        onLogin(selectedRole, credentials.username);
      }, 800);
    } else {
      setError('INVALID CREDENTIALS PROVIDED');
    }
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

        {/* Dynamic Role Selection or Authentication Form */}
        <div className="login-roles">
          {authStep === 'role_selection' ? (
            <>
              <p className="t-label" style={{ textAlign: 'center', marginBottom: 'var(--sp-6)', opacity: 0.5 }}>
                SELECT YOUR ROLE TO PROCEED
              </p>
              
              <div className="login-roles__grid">
                {ROLES.map((role) => (
                  <button
                    key={role.id}
                    className={`login-role-card ${hoveredRole === role.id ? 'login-role-card--hover' : ''}`}
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
            </>
          ) : (
            <div style={{ maxWidth: '400px', margin: '0 auto', textAlign: 'left', animation: 'fade-in 0.3s ease-out' }}>
              <div className="u-flex u-justify-between u-items-center u-mb-4">
                <p className="t-label" style={{ opacity: 0.5 }}>
                  AUTHENTICATING AS: {ROLES.find(r => r.id === selectedRole)?.title}
                </p>
                <button 
                  type="button" 
                  className="btn btn--outline" 
                  style={{ padding: '4px 10px', fontSize: '10px' }}
                  onClick={handleBack}
                  disabled={isTransitioning}
                >
                  ← BACK
                </button>
              </div>

              <form onSubmit={handleLoginSubmit} className="panel u-p-6" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)', background: 'var(--bg, #f4f3ec)', border: '1px solid var(--c-crimson, #cc0000)' }}>
                <div>
                  <label className="t-mono u-mb-2" style={{ display: 'block', fontSize: 'var(--fs-small)', opacity: 0.8, color: 'var(--text-h, #000)' }}>USERNAME</label>
                  <input 
                    type="text" 
                    style={{ 
                      width: '100%', 
                      background: 'transparent', 
                      border: '1px solid var(--c-crimson, #cc0000)', 
                      color: 'var(--text-h, #000)', 
                      padding: '12px 16px', 
                      fontFamily: 'var(--font-mono)',
                      outline: 'none'
                    }}
                    value={credentials.username}
                    onChange={e => setCredentials({...credentials, username: e.target.value})}
                    autoFocus
                    disabled={isTransitioning}
                  />
                </div>
                <div>
                  <label className="t-mono u-mb-2" style={{ display: 'block', fontSize: 'var(--fs-small)', opacity: 0.8, color: 'var(--text-h, #000)' }}>PASSWORD</label>
                  <input 
                    type="password" 
                    style={{ 
                      width: '100%', 
                      background: 'transparent', 
                      border: '1px solid var(--c-crimson, #cc0000)', 
                      color: 'var(--text-h, #000)', 
                      padding: '12px 16px', 
                      fontFamily: 'var(--font-mono)',
                      outline: 'none'
                    }}
                    value={credentials.password}
                    onChange={e => setCredentials({...credentials, password: e.target.value})}
                    disabled={isTransitioning}
                  />
                </div>
                
                {error && (
                  <div className="t-mono" style={{ color: 'var(--c-crimson)', fontSize: 'var(--fs-small)', textAlign: 'center', marginTop: 'var(--sp-2)' }}>
                    {error}
                  </div>
                )}
                
                <button 
                  type="submit" 
                  className="btn u-mt-2" 
                  style={{ width: '100%', padding: '16px', background: 'var(--c-crimson, #cc0000)', color: '#fff', border: 'none' }} 
                  disabled={isTransitioning}
                >
                  {isTransitioning ? 'AUTHENTICATING...' : 'INITIATE SESSION ✦'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

