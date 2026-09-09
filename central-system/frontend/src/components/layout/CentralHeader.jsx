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

export const CentralHeader = ({ role, onLogout }) => {
  const isOphth = role === 'ophthalmologist';
  const [showProfileDrawer, setShowProfileDrawer] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [passwordModal, setPasswordModal] = useState(false);
  const [saveToast, setSaveToast] = useState(null);

  // Editable profile state
  const [profile, setProfile] = useState({
    name: 'Dr. Rajesh Sharma',
    designation: 'District Health Officer (DHO)',
    officerId: 'DHO-MH-PUN-042',
    district: 'Pune District (Rural & Peri-Urban Zone)',
    assignedPhcs: '7 PHCs Active (Kharadi, Wagholi, Hadapsar, Lohegaon, Alandi, Saswad, Khed)',
    email: 'r.sharma.dho@health.maharashtra.gov.in',
    phone: '+91 98230 44821',
  });

  const [newPassword, setNewPassword] = useState('');

  const navLinks = isOphth
    ? [
        { to: '/ophth/queue', label: 'REVIEW QUEUE' },
      ]
    : [
        { to: '/admin/dashboard', label: 'DASHBOARD' },
        { to: '/admin/referrals', label: 'REFERRALS' },
        { to: '/admin/phc-health', label: 'PHC HEALTH' },
      ];

  const handleSaveProfile = (e) => {
    e.preventDefault();
    setEditMode(false);
    setSaveToast('Profile details updated successfully.');
    setTimeout(() => setSaveToast(null), 3000);
  };

  const handlePasswordChange = (e) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setSaveToast('Password must be at least 6 characters.');
      setTimeout(() => setSaveToast(null), 3000);
      return;
    }
    setPasswordModal(false);
    setNewPassword('');
    setSaveToast('Security credentials updated successfully.');
    setTimeout(() => setSaveToast(null), 3000);
  };

  return (
    <>
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

        {/* Role Badge: Untouched static badge for OPHTH, active Profile Drawer for ADMIN */}
        <div className="app-header__role-badge">
          {isOphth ? (
            <span className="t-label" style={{ opacity: 0.5 }}>
              ◉ OPHTH
            </span>
          ) : (
            <button
              className="app-header__role-btn t-label"
              onClick={() => setShowProfileDrawer(true)}
              title="Open District Admin Profile & Settings"
            >
              ⬡ ADMIN
            </button>
          )}
        </div>

        <button
          className="app-header__logout"
          onClick={onLogout}
          title="Switch Role / Logout"
        >
          <span className="t-label">✕ EXIT</span>
        </button>
      </header>

      {/* Admin Profile Drawer (District Admin only) */}
      {!isOphth && showProfileDrawer && (
        <div
          className="admin-drawer-overlay"
          onClick={() => {
            setShowProfileDrawer(false);
            setEditMode(false);
            setPasswordModal(false);
          }}
        >
          <div className="admin-drawer" onClick={(e) => e.stopPropagation()}>
            {/* Top Red Header */}
            <div className="admin-drawer__header">
              <div className="admin-drawer__title">
                OFFICER PROFILE // DISTRICT<br />ADMIN
              </div>
              <button
                className="admin-drawer__close-box"
                onClick={() => {
                  setShowProfileDrawer(false);
                  setEditMode(false);
                  setPasswordModal(false);
                }}
              >
                <span className="admin-drawer__close-x">✕</span>
                <span className="admin-drawer__close-lbl">CLOSE</span>
              </button>
            </div>

            {/* Drawer Body with warm cream background */}
            <div className="admin-drawer__body">
              {saveToast && (
                <div className="officer-save-toast">
                  ✓ {saveToast}
                </div>
              )}

              {editMode ? (
                /* Edit Profile Form inside white card */
                <div className="officer-card">
                  <div className="officer-avatar-wrap">
                    <div className="officer-avatar-circle">
                      <svg width="44" height="44" viewBox="0 0 24 24" fill="#9CA3AF">
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                      </svg>
                    </div>
                  </div>

                  <form onSubmit={handleSaveProfile} className="officer-form">
                    <h3 className="officer-card-title">EDIT OFFICER DETAILS</h3>
                    
                    <div className="officer-form-field">
                      <label className="officer-sublabel">FULL NAME</label>
                      <input
                        type="text"
                        className="officer-input"
                        value={profile.name}
                        onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                        required
                      />
                    </div>

                    <div className="officer-form-field">
                      <label className="officer-sublabel">CONTACT EMAIL</label>
                      <input
                        type="email"
                        className="officer-input"
                        value={profile.email}
                        onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                        required
                      />
                    </div>

                    <div className="officer-form-field">
                      <label className="officer-sublabel">DIRECT LINE</label>
                      <input
                        type="text"
                        className="officer-input"
                        value={profile.phone}
                        onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                        required
                      />
                    </div>

                    <div className="officer-btn-group">
                      <button type="submit" className="officer-btn officer-btn--action" style={{ flex: 1 }}>
                        SAVE CHANGES
                      </button>
                      <button
                        type="button"
                        className="officer-btn officer-btn--cancel"
                        onClick={() => setEditMode(false)}
                      >
                        CANCEL
                      </button>
                    </div>
                  </form>
                </div>
              ) : passwordModal ? (
                /* Change Password Form inside white card */
                <div className="officer-card">
                  <div className="officer-avatar-wrap">
                    <div className="officer-avatar-circle">
                      <svg width="44" height="44" viewBox="0 0 24 24" fill="#9CA3AF">
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                      </svg>
                    </div>
                  </div>

                  <form onSubmit={handlePasswordChange} className="officer-form">
                    <h3 className="officer-card-title">UPDATE CREDENTIALS</h3>
                    
                    <div className="officer-form-field">
                      <label className="officer-sublabel">NEW PASSWORD</label>
                      <input
                        type="password"
                        className="officer-input"
                        placeholder="Min. 6 characters"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        autoFocus
                      />
                    </div>

                    <div className="officer-btn-group">
                      <button type="submit" className="officer-btn officer-btn--action" style={{ flex: 1 }}>
                        CONFIRM NEW PASSWORD
                      </button>
                      <button
                        type="button"
                        className="officer-btn officer-btn--cancel"
                        onClick={() => setPasswordModal(false)}
                      >
                        CANCEL
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                /* The exact Profile Card matching the user reference image */
                <div className="officer-card">
                  {/* Top Circular Grey Avatar */}
                  <div className="officer-avatar-wrap">
                    <div className="officer-avatar-circle">
                      <svg width="44" height="44" viewBox="0 0 24 24" fill="#9CA3AF">
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                      </svg>
                    </div>
                  </div>

                  {/* Officer Name & Designation */}
                  <h2 className="officer-name">{profile.name}</h2>
                  <div className="officer-designation-header">{profile.designation}</div>

                  {/* Identification & Access */}
                  <div className="officer-section-title">Identification & Access</div>
                  <div className="officer-field">
                    <div className="officer-field-label">DESIGNATION & ROLE</div>
                    <div className="officer-field-val">{profile.designation}</div>
                  </div>

                  <div className="officer-field">
                    <div className="officer-field-label">OFFICER ID</div>
                    <div className="officer-field-val officer-field-val--crimson">
                      {profile.officerId}
                    </div>
                  </div>

                  <div className="officer-field">
                    <div className="officer-field-label">SECURITY CLEARANCE</div>
                    <div className="officer-clearance-badge">
                      LEVEL 4 - DISTRICT CHIEF
                    </div>
                  </div>

                  {/* Regional Assignment */}
                  <div className="officer-section-title">Regional Assignment</div>
                  <div className="officer-field">
                    <div className="officer-field-label">District REGION</div>
                    <div className="officer-field-val">{profile.district}</div>
                  </div>

                  <div className="officer-field">
                    <div className="officer-field-label">ASSIGNED PHCs</div>
                    <div className="officer-phc-list">
                      <div className="officer-phc-item">
                        <span className="officer-phc-dot">•</span> 7 PHCs Active (Kharadi, Wagholi,
                      </div>
                      <div className="officer-phc-item">
                        <span className="officer-phc-dot">•</span> Hadapsar, Lohegaon, Lohegaon
                      </div>
                      <div className="officer-phc-item">
                        <span className="officer-phc-dot">•</span> Alandi, Saswad, Khed)
                      </div>
                    </div>
                  </div>

                  {/* Contact Details */}
                  <div className="officer-section-title">Contact Details</div>
                  <div className="officer-field">
                    <div className="officer-field-label">Contact Email</div>
                    <div className="officer-field-val">{profile.email}</div>
                  </div>

                  <div className="officer-field">
                    <div className="officer-field-label">Direct Line</div>
                    <div className="officer-field-val">{profile.phone}</div>
                  </div>

                  {/* Account Actions */}
                  <div className="officer-section-title">Account Actions</div>
                  <div className="officer-field-label" style={{ marginBottom: '6px' }}>ACTIONS</div>

                  <div className="officer-action-row">
                    <button
                      type="button"
                      className="officer-btn officer-btn--action"
                      onClick={() => setEditMode(true)}
                    >
                      <span className="officer-btn-icon">✎</span> EDIT PROFILE
                    </button>

                    <button
                      type="button"
                      className="officer-btn officer-btn--action"
                      onClick={() => setPasswordModal(true)}
                    >
                      <span className="officer-btn-icon">🔑</span> CHANGE PASSWORD
                    </button>
                  </div>

                  <button
                    type="button"
                    className="officer-btn officer-btn--logout"
                    onClick={onLogout}
                  >
                    <span>✕ LOGOUT OF SESSION</span>
                    <span className="officer-btn-sparkle">✦</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
