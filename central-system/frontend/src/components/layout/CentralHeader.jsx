import React from 'react';
import { NavLink } from 'react-router-dom';
import { ConsoleStatus } from '../shared/ConsoleStatus';

const OPTH_MESSAGES = [
  'CENTRAL SYSTEM ONLINE...',
  'ML PIPELINE v4.2 CONNECTED',
  'GRAD-CAM MODULE READY',
  'LESION DETECTION ACTIVE',
  'CONFORMAL PREDICTION CALIBRATED',
  'AWAITING CASE SELECTION...',
];

const ADMIN_MESSAGES = [
  'ADMIN DASHBOARD LOADING...',
  'AGGREGATING PHC DATA...',
  'REFERRAL TRACKER ONLINE',
  'SYNC STATUS: ALL NODES CONNECTED',
  'ANALYTICS MODULE READY',
];

export const CentralHeader = ({ role, onLogout }) => {
  const isOphth = role === 'ophthalmologist';
  const navLinks = isOphth
    ? [
        { to: '/ophth/queue', label: 'REVIEW QUEUE' },
      ]
    : [
        { to: '/admin/dashboard', label: 'DASHBOARD' },
        { to: '/admin/referrals', label: 'REFERRALS' },
        { to: '/admin/phc-health', label: 'PHC HEALTH' },
      ];

  return (
    <header className="app-header">
      <div className="app-logo">
        Netra<span className="star">Setu</span>
      </div>

      <div style={{ overflow: 'hidden' }}>
        <ConsoleStatus messages={isOphth ? OPTH_MESSAGES : ADMIN_MESSAGES} />
      </div>

      <nav className="app-nav">
        {navLinks.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              `app-nav__link ${isActive ? 'active' : ''}`
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>

      <div className="app-header__role-badge">
        <span className="t-label" style={{ opacity: 0.5 }}>
          {isOphth ? '◉ OPHTH' : '⬡ ADMIN'}
        </span>
      </div>

      <button
        className="app-header__logout"
        onClick={onLogout}
        title="Switch Role / Logout"
      >
        <span className="t-label">✕ EXIT</span>
      </button>
    </header>
  );
};
