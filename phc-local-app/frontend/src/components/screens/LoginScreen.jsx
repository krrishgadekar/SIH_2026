import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RetinalWaveCanvas } from '../shared/RetinalWaveCanvas';

export const LoginScreen = ({ onLogin }) => {
  const { t } = useTranslation();
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Technician credentials
  const [username, setUsername] = useState('krrish');
  const [password, setPassword] = useState('tech123');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError(t('login.auth.errorEmpty', 'Please enter both username and password.'));
      return;
    }

    setLoading(true);
    setError(null);

    setTimeout(() => {
      if (
        (username.toLowerCase() === 'krrish' && password === 'tech123') ||
        (username.toLowerCase() === 'technician' && password === 'tech123') ||
        password.length >= 4
      ) {
        setIsTransitioning(true);
        setTimeout(() => {
          if (onLogin) {
            onLogin({
              authenticated: true,
              role: 'technician',
              username: username.trim(),
              name: username.toLowerCase().includes('krrish') ? 'Krrish Gadekar' : username.trim(),
              roleTitle: 'PHC Technician',
              phc: 'PHC Kharadi'
            });
          }
        }, 400);
      } else {
        setError(t('login.auth.errorInvalid', 'INVALID CREDENTIALS. USE DEMO: krrish / tech123'));
        setLoading(false);
      }
    }, 400);
  };

  return (
    <div className="login-screen">
      <RetinalWaveCanvas />

      <div className="login-screen__content" style={{ position: 'relative', zIndex: 1 }}>
        {/* Top Header branding */}
        <div
          className={`login-hero ${isTransitioning ? 'login-hero--exit' : ''}`}
          style={{ marginBottom: 'var(--sp-6)' }}
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

        {/* Single Technician Auth Card */}
        <div className={`login-auth-container ${isTransitioning ? 'login-auth-container--exit' : ''}`}>
          <div className="login-auth-topbar">
            <span style={{ fontWeight: 600 }}>
              {t('login.auth.authenticatingAs', 'AUTHENTICATING AS: {{role}}', { role: 'PHC TECHNICIAN' })}
            </span>
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
                <span style={{ fontWeight: 700, color: 'var(--c-crimson)' }}>krrish</span> /{' '}
                <span style={{ fontWeight: 700, color: 'var(--c-crimson)' }}>tech123</span>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
