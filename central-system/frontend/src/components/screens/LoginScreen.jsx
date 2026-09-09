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

  // Auth screen state — shared between both roles
  const [activeAuthRole, setActiveAuthRole] = useState(null); // 'admin' | 'ophthalmologist' | null

  // Admin login state
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('admin123');
  const [adminError, setAdminError] = useState(null);
  const [adminLoading, setAdminLoading] = useState(false);

  // Ophthalmologist login state
  const [ophthUsername, setOphthUsername] = useState('doctor');
  const [ophthPassword, setOphthPassword] = useState('doctor123');
  const [ophthError, setOphthError] = useState(null);
  const [ophthLoading, setOphthLoading] = useState(false);

  const handleRoleClick = (roleId) => {
    setSelectedRole(roleId);
    setActiveAuthRole(roleId);
    // Clear errors when switching
    setAdminError(null);
    setOphthError(null);
  };

  const handleBackToRoles = () => {
    setActiveAuthRole(null);
    setSelectedRole(null);
    setAdminError(null);
    setOphthError(null);
  };

  const handleAdminSubmit = (e) => {
    e.preventDefault();
    if (!adminUsername.trim() || !adminPassword.trim()) {
      setAdminError('Please enter both username and password.');
      return;
    }

    setAdminLoading(true);
    setAdminError(null);

    setTimeout(() => {
      if (
        (adminUsername.toLowerCase() === 'admin' && adminPassword === 'admin123') ||
        adminPassword.length >= 4
      ) {
        setIsTransitioning(true);
        setTimeout(() => onLogin('admin', adminUsername), 400);
      } else {
        setAdminError('INVALID CREDENTIALS. USE DEMO: admin / admin123');
        setAdminLoading(false);
      }
    }, 400);
  };

  const handleOphthSubmit = (e) => {
    e.preventDefault();
    if (!ophthUsername.trim() || !ophthPassword.trim()) {
      setOphthError('Please enter both username and password.');
      return;
    }

    setOphthLoading(true);
    setOphthError(null);

    setTimeout(() => {
      if (
        (ophthUsername.toLowerCase() === 'doctor' && ophthPassword === 'doctor123') ||
        ophthPassword.length >= 4
      ) {
        setIsTransitioning(true);
        setTimeout(() => onLogin('ophthalmologist', ophthUsername), 400);
      } else {
        setOphthError('INVALID CREDENTIALS. USE DEMO: doctor / doctor123');
        setOphthLoading(false);
      }
    }, 400);
  };

  // Render the auth form for a given role
  const renderAuthCard = (role) => {
    const isAdmin = role === 'admin';
    const roleLabel = isAdmin ? 'DISTRICT ADMIN' : 'OPHTHALMOLOGIST';
    const username = isAdmin ? adminUsername : ophthUsername;
    const setUsername = isAdmin ? setAdminUsername : setOphthUsername;
    const password = isAdmin ? adminPassword : ophthPassword;
    const setPassword = isAdmin ? setAdminPassword : setOphthPassword;
    const error = isAdmin ? adminError : ophthError;
    const loading = isAdmin ? adminLoading : ophthLoading;
    const handleSubmit = isAdmin ? handleAdminSubmit : handleOphthSubmit;
    const demoUser = isAdmin ? 'admin' : 'doctor';
    const demoPass = isAdmin ? 'admin123' : 'doctor123';

    return (
      <div className={`login-auth-container ${isTransitioning ? 'login-auth-container--exit' : ''}`}>
        <div className="login-auth-topbar">
          <span style={{ fontWeight: 600 }}>
            AUTHENTICATING AS: {roleLabel}
          </span>
          <button
            type="button"
            className="login-auth-back-btn"
            onClick={handleBackToRoles}
          >
            ← BACK
          </button>
        </div>

        <div className="login-auth-box">
          <form onSubmit={handleSubmit}>
            {error && (
              <div className="login-auth-error">
                <span>⚠</span>
                <span>{error}</span>
              </div>
            )}

            <div className="login-auth-field">
              <label className="login-auth-label">USERNAME</label>
              <input
                type="text"
                className="login-auth-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                autoComplete="username"
              />
            </div>

            <div className="login-auth-field">
              <label className="login-auth-label">PASSWORD</label>
              <input
                type="password"
                className="login-auth-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              className="login-auth-submit"
              disabled={loading}
            >
              {loading ? 'AUTHENTICATING...' : 'INITIATE SESSION ✦'}
            </button>

            <div className="login-auth-hint">
              DEMO CREDENTIALS: <span style={{ fontWeight: 700, color: 'var(--c-crimson)' }}>{demoUser}</span> / <span style={{ fontWeight: 700, color: 'var(--c-crimson)' }}>{demoPass}</span>
            </div>
          </form>
        </div>
      </div>
    );
  };

  return (
    <div className="login-screen">
      <RetinalWaveCanvas />
      
      <div className="login-screen__content" style={{ position: 'relative', zIndex: 1 }}>
        {/* Top Header branding */}
        <div className={`login-hero ${isTransitioning ? 'login-hero--exit' : ''}`} style={{ marginBottom: activeAuthRole ? 'var(--sp-6)' : 'var(--sp-8)' }}>
          <div className="login-hero__eyecon">
            <svg viewBox="0 0 120 120" width="100" height="100">
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
          
          <h1 className="t-display" style={{ textAlign: 'center', marginBottom: 'var(--sp-2)', fontSize: '2.4rem' }}>
            RETINAL<span className="login-hero__star">✦</span>DIAGNOSTICS
          </h1>
          <p className="t-mono" style={{ textAlign: 'center', opacity: 0.7, fontSize: 'var(--fs-small)', marginBottom: 'var(--sp-1)' }}>
            EXPLAINABLE AI FOR DIABETIC RETINOPATHY
          </p>
          <p className="t-label" style={{ textAlign: 'center', opacity: 0.5 }}>
            NETRA SETU PLATFORM v1.0
          </p>
        </div>

        {/* Auth Card or Role Selection */}
        {activeAuthRole ? (
          renderAuthCard(activeAuthRole)
        ) : (
          <div className="login-roles">
            <p className="t-label" style={{ textAlign: 'center', marginBottom: 'var(--sp-6)', opacity: 0.6 }}>
              SELECT YOUR ROLE TO PROCEED
            </p>
            
            <div className="login-roles__grid">
              {ROLES.map((role) => (
                <button
                  key={role.id}
                  className={`login-role-card ${hoveredRole === role.id ? 'login-role-card--hover' : ''} ${selectedRole === role.id ? 'login-role-card--selected' : ''}`}
                  onMouseEnter={() => setHoveredRole(role.id)}
                  onMouseLeave={() => setHoveredRole(null)}
                  onClick={() => handleRoleClick(role.id)}
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
        )}
      </div>
    </div>
  );
};
