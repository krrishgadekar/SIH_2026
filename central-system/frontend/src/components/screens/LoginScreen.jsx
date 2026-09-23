import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RetinalWaveCanvas } from '../shared/RetinalWaveCanvas';

export const LoginScreen = ({ onLogin }) => {
  const { t } = useTranslation();
  const [hoveredRole, setHoveredRole] = useState(null);
  const [selectedRole, setSelectedRole] = useState(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const ROLES = [
    {
      id: 'ophthalmologist',
      title: t('central.login.roles.ophthalmologist.title', 'OPHTHALMOLOGIST'),
      subtitle: t('central.login.roles.ophthalmologist.subtitle', 'Case Review & Diagnosis'),
      description: t('central.login.roles.ophthalmologist.desc', 'Review AI-graded retinal scans, confirm or override diagnoses, and manage the review queue.'),
      icon: '◉',
      stats: `6 ${t('central.login.roles.ophthalmologist.stats', 'cases pending')}`,
    },
    {
      id: 'admin',
      title: t('central.login.roles.admin.title', 'DISTRICT ADMIN'),
      subtitle: t('central.login.roles.admin.subtitle', 'Analytics & Oversight'),
      description: t('central.login.roles.admin.desc', 'Monitor PHC performance, track referrals, view screening analytics, and manage district-wide operations.'),
      icon: '⬡',
      stats: `42 ${t('central.login.roles.admin.stats', 'cases today')}`,
    },
  ];

  // Auth screen state — shared between both roles
  const [activeAuthRole, setActiveAuthRole] = useState(null); // 'admin' | 'ophthalmologist' | null

  // Admin login state
  const [adminUsername, setAdminUsername] = useState('krrish');
  const [adminPassword, setAdminPassword] = useState('admin123');
  const [adminError, setAdminError] = useState(null);
  const [adminLoading, setAdminLoading] = useState(false);

  // Ophthalmologist login state
  const [ophthUsername, setOphthUsername] = useState('krrish');
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
      setAdminError(t('central.login.auth.errorEmpty', 'Please enter both username and password.'));
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
        setAdminError(t('central.login.auth.errorInvalid', 'INVALID CREDENTIALS. USE DEMO: {{user}} / {{pass}}', { user: 'admin', pass: 'admin123' }));
        setAdminLoading(false);
      }
    }, 400);
  };

  const handleOphthSubmit = (e) => {
    e.preventDefault();
    if (!ophthUsername.trim() || !ophthPassword.trim()) {
      setOphthError(t('central.login.auth.errorEmpty', 'Please enter both username and password.'));
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
        setOphthError(t('central.login.auth.errorInvalid', 'INVALID CREDENTIALS. USE DEMO: {{user}} / {{pass}}', { user: 'doctor', pass: 'doctor123' }));
        setOphthLoading(false);
      }
    }, 400);
  };

  // Render the auth form for a given role
  const renderAuthCard = (role) => {
    const isAdmin = role === 'admin';
    const roleLabel = isAdmin ? t('central.login.roles.admin.title', 'DISTRICT ADMIN') : t('central.login.roles.ophthalmologist.title', 'OPHTHALMOLOGIST');
    const username = isAdmin ? adminUsername : ophthUsername;
    const setUsername = isAdmin ? setAdminUsername : setOphthUsername;
    const password = isAdmin ? adminPassword : ophthPassword;
    const setPassword = isAdmin ? setAdminPassword : setOphthPassword;
    const error = isAdmin ? adminError : ophthError;
    const loading = isAdmin ? adminLoading : ophthLoading;
    const handleSubmit = isAdmin ? handleAdminSubmit : handleOphthSubmit;
    const demoUser = 'krrish';
    const demoPass = isAdmin ? 'admin123' : 'doctor123';

    return (
      <div className={`login-auth-container ${isTransitioning ? 'login-auth-container--exit' : ''}`}>
        <div className="login-auth-topbar">
          <span style={{ fontWeight: 600 }}>
            {t('central.login.auth.authenticatingAs', 'AUTHENTICATING AS: {{role}}', { role: roleLabel })}
          </span>
          <button
            type="button"
            className="login-auth-back-btn"
            onClick={handleBackToRoles}
          >
            {t('central.login.auth.back', '← BACK')}
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
              <label className="login-auth-label">{t('central.login.auth.username', 'USERNAME')}</label>
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
              <label className="login-auth-label">{t('central.login.auth.password', 'PASSWORD')}</label>
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
              {loading ? t('central.login.auth.authenticating', 'AUTHENTICATING...') : t('central.login.auth.initiate', 'INITIATE SESSION ✦')}
            </button>

            <div className="login-auth-hint">
              {t('central.login.auth.demo', 'DEMO CREDENTIALS:')} <span style={{ fontWeight: 700, color: 'var(--c-crimson)' }}>{demoUser}</span> / <span style={{ fontWeight: 700, color: 'var(--c-crimson)' }}>{demoPass}</span>
            </div>
          </form>
        </div>
      </div>
    );
  };

  return (
    <div className="login-screen">
      <RetinalWaveCanvas />
      
      {/* Floating decorative particles */}
      <div className="login-particles">
        <div className="login-particle" />
        <div className="login-particle" />
        <div className="login-particle" />
        <div className="login-particle" />
        <div className="login-particle" />
        <div className="login-particle" />
      </div>
      
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
            {t('central.login.title', 'RETINAL✦DIAGNOSTICS').split('✦').map((part, i) => (
              <React.Fragment key={i}>
                {part}
                {i === 0 && <span className="login-hero__star">✦</span>}
              </React.Fragment>
            ))}
          </h1>
          <p className="t-mono" style={{ textAlign: 'center', opacity: 0.7, fontSize: 'var(--fs-small)', marginBottom: 'var(--sp-1)' }}>
            {t('central.login.subtitle', 'EXPLAINABLE AI FOR DIABETIC RETINOPATHY')}
          </p>
          <p className="t-label" style={{ textAlign: 'center', opacity: 0.5 }}>
            {t('central.login.version', 'NETRA SETU PLATFORM v1.0')}
          </p>
        </div>

        {/* Auth Card or Role Selection */}
        {activeAuthRole ? (
          renderAuthCard(activeAuthRole)
        ) : (
          <div className="login-roles">
            <p className="t-label" style={{ textAlign: 'center', marginBottom: 'var(--sp-6)', opacity: 0.6 }}>
              {t('central.login.selectRole', 'SELECT YOUR ROLE TO PROCEED')}
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
