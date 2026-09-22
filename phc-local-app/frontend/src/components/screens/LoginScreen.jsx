import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RetinalWaveCanvas } from '../shared/RetinalWaveCanvas';

export const LoginScreen = ({ onLogin }) => {
  const { t } = useTranslation();
  const [hoveredRole, setHoveredRole] = useState(null);
  const [selectedRole, setSelectedRole] = useState(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Auth screen state
  const [activeAuthRole, setActiveAuthRole] = useState(null); // 'technician' | 'field_worker' | null

  // Technician credentials
  const [techUsername, setTechUsername] = useState('krrish');
  const [techPassword, setTechPassword] = useState('tech123');
  const [techError, setTechError] = useState(null);
  const [techLoading, setTechLoading] = useState(false);

  // Field Worker credentials
  const [fieldUsername, setFieldUsername] = useState('asha_worker');
  const [fieldPassword, setFieldPassword] = useState('camp123');
  const [fieldError, setFieldError] = useState(null);
  const [fieldLoading, setFieldLoading] = useState(false);

  const ROLES = [
    {
      id: 'technician',
      title: t('login.roles.technician.title', 'PHC TECHNICIAN'),
      subtitle: t('login.roles.technician.subtitle', 'Patient Intake & Fundus Capture'),
      description: t('login.roles.technician.desc', 'Register patients, capture retinal fundus images, execute instant local AI quality triage, and manage the clinic queue.'),
      icon: '◉',
      stats: t('login.roles.technician.stats', 'PHC Kharadi · Local AI Ready'),
      defaultUser: 'krrish',
      defaultPass: 'tech123',
    },
    {
      id: 'field_worker',
      title: t('login.roles.field_worker.title', 'COMMUNITY HEALTH WORKER'),
      subtitle: t('login.roles.field_worker.subtitle', 'Camp Screening & Rapid Vitals'),
      description: t('login.roles.field_worker.desc', 'Outreach screening registration, risk factor questionnaires, and community camp triage intake.'),
      icon: '⬡',
      stats: t('login.roles.field_worker.stats', 'Rural Outreach · Fast Queue'),
      defaultUser: 'asha_worker',
      defaultPass: 'camp123',
    },
  ];

  const handleRoleClick = (roleId) => {
    setSelectedRole(roleId);
    setActiveAuthRole(roleId);
    setTechError(null);
    setFieldError(null);
  };

  const handleBackToRoles = () => {
    setActiveAuthRole(null);
    setSelectedRole(null);
    setTechError(null);
    setFieldError(null);
  };

  const handleTechSubmit = (e) => {
    e.preventDefault();
    if (!techUsername.trim() || !techPassword.trim()) {
      setTechError(t('login.auth.errorEmpty', 'Please enter both username and password.'));
      return;
    }

    setTechLoading(true);
    setTechError(null);

    setTimeout(() => {
      if (
        (techUsername.toLowerCase() === 'krrish' && techPassword === 'tech123') ||
        (techUsername.toLowerCase() === 'technician' && techPassword === 'tech123') ||
        techPassword.length >= 4
      ) {
        setIsTransitioning(true);
        setTimeout(() => {
          if (onLogin) {
            onLogin({
              authenticated: true,
              role: 'technician',
              username: techUsername.trim(),
              name: techUsername.toLowerCase().includes('krrish') ? 'Krrish Gadekar' : techUsername.trim(),
              roleTitle: 'PHC Technician',
              phc: 'PHC Kharadi'
            });
          }
        }, 400);
      } else {
        setTechError(t('login.auth.errorInvalid', 'INVALID CREDENTIALS. USE DEMO: krrish / tech123'));
        setTechLoading(false);
      }
    }, 400);
  };

  const handleFieldSubmit = (e) => {
    e.preventDefault();
    if (!fieldUsername.trim() || !fieldPassword.trim()) {
      setFieldError(t('login.auth.errorEmpty', 'Please enter both username and password.'));
      return;
    }

    setFieldLoading(true);
    setFieldError(null);

    setTimeout(() => {
      if (
        (fieldUsername.toLowerCase() === 'asha_worker' && fieldPassword === 'camp123') ||
        fieldPassword.length >= 4
      ) {
        setIsTransitioning(true);
        setTimeout(() => {
          if (onLogin) {
            onLogin({
              authenticated: true,
              role: 'field_worker',
              username: fieldUsername.trim(),
              name: 'ASHA Worker (Field Camp)',
              roleTitle: 'Community Health Worker',
              phc: 'PHC Kharadi'
            });
          }
        }, 400);
      } else {
        setFieldError(t('login.auth.errorInvalidField', 'INVALID CREDENTIALS. USE DEMO: asha_worker / camp123'));
        setFieldLoading(false);
      }
    }, 400);
  };

  const renderAuthCard = (roleId) => {
    const isTech = roleId === 'technician';
    const roleLabel = isTech 
      ? t('login.roles.technician.title', 'PHC TECHNICIAN') 
      : t('login.roles.field_worker.title', 'COMMUNITY HEALTH WORKER');
    const username = isTech ? techUsername : fieldUsername;
    const setUsername = isTech ? setTechUsername : setFieldUsername;
    const password = isTech ? techPassword : fieldPassword;
    const setPassword = isTech ? setTechPassword : setFieldPassword;
    const error = isTech ? techError : fieldError;
    const loading = isTech ? techLoading : fieldLoading;
    const handleSubmit = isTech ? handleTechSubmit : handleFieldSubmit;
    const demoUser = isTech ? 'krrish' : 'asha_worker';
    const demoPass = isTech ? 'tech123' : 'camp123';

    return (
      <div className={`login-auth-container ${isTransitioning ? 'login-auth-container--exit' : ''}`}>
        <div className="login-auth-topbar">
          <span style={{ fontWeight: 600 }}>
            {t('login.auth.authenticatingAs', 'AUTHENTICATING AS: {{role}}', { role: roleLabel })}
          </span>
          <button
            type="button"
            className="login-auth-back-btn"
            onClick={handleBackToRoles}
          >
            {t('login.auth.back', '← BACK')}
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
              <label className="login-auth-label">{t('login.auth.username', 'USERNAME')}</label>
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
              <label className="login-auth-label">{t('login.auth.password', 'PASSWORD')}</label>
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
              {loading ? t('login.auth.authenticating', 'AUTHENTICATING...') : t('login.auth.initiate', 'INITIATE SESSION ✦')}
            </button>

            <div className="login-auth-hint">
              {t('login.auth.demo', 'DEMO CREDENTIALS:')}{' '}
              <span style={{ fontWeight: 700, color: 'var(--c-crimson)' }}>{demoUser}</span> /{' '}
              <span style={{ fontWeight: 700, color: 'var(--c-crimson)' }}>{demoPass}</span>
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
        <div
          className={`login-hero ${isTransitioning ? 'login-hero--exit' : ''}`}
          style={{ marginBottom: activeAuthRole ? 'var(--sp-6)' : 'var(--sp-8)' }}
        >
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
            {t('login.title', 'RETINAL✦DIAGNOSTICS').split('✦').map((part, i) => (
              <React.Fragment key={i}>
                {part}
                {i === 0 && <span className="login-hero__star">✦</span>}
              </React.Fragment>
            ))}
          </h1>
          <p className="t-mono" style={{ textAlign: 'center', opacity: 0.85, fontSize: 'var(--fs-small)', marginBottom: 'var(--sp-1)' }}>
            {t('login.subtitle', 'PRIMARY HEALTH CENTRE MODULE · LOCAL QUALITY GATE')}
          </p>
          <p className="t-label" style={{ textAlign: 'center', opacity: 0.6 }}>
            {t('login.version', 'NETRA SETU PLATFORM v1.0 · PHC KHARADI')}
          </p>
        </div>

        {/* Auth Card or Role Selection */}
        {activeAuthRole ? (
          renderAuthCard(activeAuthRole)
        ) : (
          <div className="login-roles">
            <p className="t-label" style={{ textAlign: 'center', marginBottom: 'var(--sp-6)', opacity: 0.65 }}>
              {t('login.selectRole', 'SELECT OPERATOR PROFILE TO PROCEED')}
            </p>

            <div className="login-roles__grid">
              {ROLES.map((role) => (
                <button
                  key={role.id}
                  type="button"
                  className={`login-role-card ${hoveredRole === role.id ? 'login-role-card--hover' : ''} ${selectedRole === role.id ? 'login-role-card--selected' : ''}`}
                  onMouseEnter={() => setHoveredRole(role.id)}
                  onMouseLeave={() => setHoveredRole(null)}
                  onClick={() => handleRoleClick(role.id)}
                  disabled={isTransitioning}
                >
                  <div className="login-role-card__icon">{role.icon}</div>
                  <div className="login-role-card__title t-h2">{role.title}</div>
                  <div className="login-role-card__subtitle t-mono">{role.subtitle}</div>
                  <div className="login-role-card__desc t-body" style={{ marginTop: 'var(--sp-3)', opacity: 0.75, fontSize: 'var(--fs-small)' }}>
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

export default LoginScreen;
