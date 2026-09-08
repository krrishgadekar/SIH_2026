import React, { useState } from 'react';
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

export const CentralHeader = ({ role, userProfile, onUpdateProfile, onLogout }) => {
  const isOphth = role === 'ophthalmologist';
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [editProfile, setEditProfile] = useState(userProfile || { username: '', fullName: '', phone: '', location: '' });

  const handleSaveProfile = () => {
    onUpdateProfile(editProfile);
    setShowProfileModal(false);
  };
  const navLinks = isOphth
    ? [
        { to: '/ophth/queue', label: 'REVIEW QUEUE' },
        { to: '/ophth/timeline', label: 'PATIENT TIMELINE' },
        { to: '/ophth/field-ops', label: 'FIELD OPS' },
        { to: '/ophth/health', label: 'PROGRAM HEALTH' },
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

      <div className="app-header__actions" style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
        <button 
          className="app-header__help" 
          onClick={() => setShowHelpModal(true)}
          style={{ 
            background: 'none', border: 'none', color: 'var(--text-h)', cursor: 'pointer', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: '8px'
          }}
        >
          <span className="t-label" style={{ opacity: 0.5 }}>SETTINGS</span>
          <span style={{ fontSize: '12px', opacity: 0.8 }}>⚙</span>
        </button>

        <span style={{ color: 'var(--c-crimson)', opacity: 0.3 }}>|</span>

        <button 
          className="app-header__profile" 
          onClick={() => {
            setEditProfile(userProfile || { username: '', fullName: '', phone: '', location: '' });
            setShowProfileModal(true);
          }}
          style={{ 
            background: 'none', 
            border: 'none', 
            color: 'var(--text-h)', 
            cursor: 'pointer', 
            fontFamily: 'var(--font-mono)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <span className="t-label" style={{ opacity: 0.5 }}>{userProfile?.fullName || 'PG'}</span>
          <span style={{ fontSize: '10px', opacity: 0.8 }}>✎</span>
        </button>

        <span style={{ color: 'var(--c-crimson)', opacity: 0.3 }}>|</span>

        <div className="app-header__role" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
      </div>

      {showProfileModal && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="panel u-p-6" style={{ width: '400px', backgroundColor: 'var(--bg, #f4f3ec)', border: '1px solid var(--c-crimson, #cc0000)' }}>
            <div className="u-flex u-justify-between u-items-center u-mb-4">
              <h2 className="t-h3" style={{ margin: 0, color: 'var(--text-h)' }}>EDIT PROFILE</h2>
              <button onClick={() => setShowProfileModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-h)', cursor: 'pointer', fontSize: '18px' }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
              <div>
                <label className="t-mono u-mb-2" style={{ display: 'block', fontSize: 'var(--fs-small)', opacity: 0.8, color: 'var(--text)' }}>USERNAME</label>
                <input type="text" value={userProfile?.username || ''} disabled style={{ width: '100%', background: 'transparent', border: '1px solid var(--c-crimson, #cc0000)', color: 'var(--text-h)', padding: '12px', fontFamily: 'var(--font-mono)', opacity: 0.5 }} />
              </div>
              <div>
                <label className="t-mono u-mb-2" style={{ display: 'block', fontSize: 'var(--fs-small)', opacity: 0.8, color: 'var(--text)' }}>FULL NAME</label>
                <input type="text" value={editProfile.fullName} onChange={e => setEditProfile({...editProfile, fullName: e.target.value})} style={{ width: '100%', background: 'transparent', border: '1px solid var(--c-crimson, #cc0000)', color: 'var(--text-h)', padding: '12px', fontFamily: 'var(--font-mono)', outline: 'none' }} />
              </div>
              <div>
                <label className="t-mono u-mb-2" style={{ display: 'block', fontSize: 'var(--fs-small)', opacity: 0.8, color: 'var(--text)' }}>PHONE NUMBER</label>
                <input type="text" value={editProfile.phone} onChange={e => setEditProfile({...editProfile, phone: e.target.value})} style={{ width: '100%', background: 'transparent', border: '1px solid var(--c-crimson, #cc0000)', color: 'var(--text-h)', padding: '12px', fontFamily: 'var(--font-mono)', outline: 'none' }} />
              </div>
              <div>
                <label className="t-mono u-mb-2" style={{ display: 'block', fontSize: 'var(--fs-small)', opacity: 0.8, color: 'var(--text)' }}>CLINIC / HOSPITAL LOCATION</label>
                <input type="text" value={editProfile.location} onChange={e => setEditProfile({...editProfile, location: e.target.value})} style={{ width: '100%', background: 'transparent', border: '1px solid var(--c-crimson, #cc0000)', color: 'var(--text-h)', padding: '12px', fontFamily: 'var(--font-mono)', outline: 'none' }} />
              </div>
              <button className="btn btn--success u-mt-4" style={{ width: '100%', background: 'var(--c-crimson, #cc0000)', color: '#fff', border: 'none' }} onClick={handleSaveProfile}>SAVE CHANGES</button>
            </div>
          </div>
        </div>
      )}

      {showHelpModal && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="panel u-p-6" style={{ width: '400px', backgroundColor: 'var(--bg, #f4f3ec)', border: '1px solid var(--c-crimson, #cc0000)' }}>
            <div className="u-flex u-justify-between u-items-center u-mb-4">
              <h2 className="t-h3" style={{ margin: 0, color: 'var(--text-h)' }}>SETTINGS</h2>
              <button onClick={() => setShowHelpModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-h)', cursor: 'pointer', fontSize: '18px' }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
              <div style={{ paddingBottom: 'var(--sp-4)', borderBottom: '1px solid var(--border)' }}>
                <h3 className="t-mono u-mb-2" style={{ fontSize: 'var(--fs-small)', opacity: 0.8, color: 'var(--text)' }}>CONTACT SUPPORT</h3>
                <p className="t-mono" style={{ fontSize: 'var(--fs-small)', color: 'var(--text-h)' }}>Email: support@netrasetu.gov.in</p>
                <p className="t-mono" style={{ fontSize: 'var(--fs-small)', color: 'var(--text-h)' }}>Hotline: 1800-112-233</p>
              </div>
              <div>
                <h3 className="t-mono u-mb-2" style={{ fontSize: 'var(--fs-small)', opacity: 0.8, color: 'var(--text)' }}>GENERIC SETTINGS</h3>
                <label className="u-flex u-items-center u-gap-2 u-mb-2" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" defaultChecked />
                  <span className="t-mono" style={{ fontSize: 'var(--fs-small)', color: 'var(--text-h)' }}>Enable Sound Alerts</span>
                </label>
                <label className="u-flex u-items-center u-gap-2 u-mb-2" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" defaultChecked />
                  <span className="t-mono" style={{ fontSize: 'var(--fs-small)', color: 'var(--text-h)' }}>Show High Priority Notifications First</span>
                </label>
                <label className="u-flex u-items-center u-gap-2" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" />
                  <span className="t-mono" style={{ fontSize: 'var(--fs-small)', color: 'var(--text-h)' }}>Compact Table View</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
