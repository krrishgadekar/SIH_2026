import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ConsoleStatus } from '../shared/ConsoleStatus';



const CentralHeader = ({ role, userProfile, onUpdateProfile, onLogout }) => {
  const { t, i18n } = useTranslation();
  const isOphth = role === 'ophthalmologist';
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showProfileDrawer, setShowProfileDrawer] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [passwordModal, setPasswordModal] = useState(false);
  const [saveToast, setSaveToast] = useState(null);

  const OPTH_MESSAGES = [
    t('central.header.statusLive', 'CENTRAL SYSTEM ONLINE...'),
    'ML PIPELINE v4.2 CONNECTED',
    'GRAD-CAM MODULE READY',
    'LESION DETECTION ACTIVE',
    'CONFORMAL PREDICTION CALIBRATED',
    'AWAITING CASE SELECTION...',
  ];

  const ADMIN_MESSAGES = [
    'DISTRICT WORKER DASHBOARD LOADING...',
    'AGGREGATING PHC DATA...',
    'REFERRAL TRACKER ONLINE',
    'SYNC STATUS: ALL NODES CONNECTED',
    'ANALYTICS MODULE READY',
  ];

  // Editable profile state
  const [profile, setProfile] = useState(() => ({
    name: userProfile?.fullName || (isOphth ? 'Dr. Krrish Gadekar' : 'Krrish Gadekar'),
    designation: userProfile?.designation || (isOphth ? 'Chief Retina Specialist / Lead Ophthalmologist' : 'District Health Worker (DHW)'),
    officerId: userProfile?.officerId || (isOphth ? 'MCI-MH-2018-89421' : 'DHW-MH-PUN-042'),
    district: userProfile?.district || userProfile?.location || (isOphth ? 'District Civil Hospital & Regional Tele-Ophthalmology Centre, Pune' : 'Pune District (Rural & Peri-Urban Zone)'),
    assignedPhcs: '7 PHCs Active (Kharadi, Wagholi, Hadapsar, Lohegaon, Alandi, Saswad, Khed)',
    email: userProfile?.email || 'krrishgadekar@gmail.com',
    phone: userProfile?.phone || '+91 98230 44821',
  }));

  React.useEffect(() => {
    if (userProfile) {
      setProfile(prev => ({
        ...prev,
        name: userProfile.fullName || prev.name,
        designation: userProfile.designation || prev.designation,
        officerId: userProfile.officerId || prev.officerId,
        district: userProfile.district || userProfile.location || prev.district,
        email: userProfile.email || prev.email,
        phone: userProfile.phone || prev.phone,
      }));
    }
  }, [userProfile]);

  const [newPassword, setNewPassword] = useState('');

  const navLinks = isOphth
    ? [
        { to: '/ophth/queue', label: t('central.header.nav.queue', 'CASES') },
      ]
    : [
        { to: '/admin/dashboard', label: t('central.header.nav.overview', 'OVERVIEW'), end: true },
        { to: '/admin/dashboard/detailed', label: t('central.header.nav.fullDashboard', 'DASHBOARD') },
        { to: '/admin/referrals', label: t('central.header.nav.referrals', 'REFERRALS') },
        { to: '/admin/phc-health', label: t('central.header.nav.phcHealth', 'PHC & SYSTEM HEALTH') },
        { to: '/admin/resources', label: t('central.header.nav.resources', 'RESOURCE PLANNING') },
      ];

  const handleOfficerSaveProfile = (e) => {
    e.preventDefault();
    setEditMode(false);
    if (onUpdateProfile) {
      onUpdateProfile({
        fullName: profile.name,
        email: profile.email,
        phone: profile.phone,
        location: profile.district,
        district: profile.district,
        designation: profile.designation,
        officerId: profile.officerId
      });
    }
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
          NetraSetu
        </div>

        <div className="app-header__ticker">
          <ConsoleStatus messages={isOphth ? OPTH_MESSAGES : ADMIN_MESSAGES} />
        </div>

        <nav className="app-nav">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `app-nav__link ${isActive ? 'active' : ''}`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="app-header__actions" style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="t-label" style={{ opacity: 0.5 }}>{t('central.header.language', 'LANGUAGE')}</span>
            <select 
              value={i18n.language || 'en'} 
              onChange={(e) => i18n.changeLanguage(e.target.value)}
              className="select"
              style={{ padding: '4px 24px 4px 8px', fontSize: '10px', height: 'auto', minWidth: '70px', backgroundSize: '8px', backgroundPosition: 'right 8px center', borderColor: 'rgba(255,255,255,0.2)' }}
            >
              <option value="en">ENG</option>
              <option value="hi">हिंदी</option>
              <option value="mr">मराठी</option>
            </select>
          </div>

          <span style={{ color: 'var(--c-crimson)', opacity: 0.3 }}>|</span>

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

          {isOphth && (
            <>
              <span style={{ color: 'var(--c-crimson)', opacity: 0.3 }}>|</span>

              <button 
                className="app-header__profile" 
                onClick={() => setShowProfileDrawer(true)}
                title="Open Ophthalmologist Profile & Settings"
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
                <span className="t-label" style={{ opacity: 0.9, fontWeight: 700, color: 'var(--c-crimson)' }}>
                  {profile.name}
                </span>
                <span style={{ fontSize: '10px', opacity: 0.8 }}>✎</span>
              </button>
            </>
          )}

          <span style={{ color: 'var(--c-crimson)', opacity: 0.3 }}>|</span>

          {/* Role Badge: active Profile Drawer for both OPHTH and WORKER */}
          <div className="app-header__role-badge">
            {isOphth ? (
              <button
                className="app-header__role-btn t-label"
                onClick={() => setShowProfileDrawer(true)}
                title="Open Ophthalmologist Profile & Settings"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span>◉ OPHTH:</span>
                <span style={{ fontWeight: 700, color: 'var(--c-crimson)' }}>
                  {profile.name}
                </span>
              </button>
            ) : (
              <button
                className="app-header__role-btn t-label"
                onClick={() => setShowProfileDrawer(true)}
                title="Open District Worker Profile & Settings"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span>⬡ WORKER:</span>
                <span style={{ fontWeight: 700, color: 'var(--c-crimson)' }}>
                  {profile.name}
                </span>
              </button>
            )}
          </div>

          <button
            className="app-header__logout"
            onClick={onLogout}
            title="Switch Role / Logout"
            style={{ 
              background: 'none', border: 'none', color: 'var(--text-h)', cursor: 'pointer', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: '8px'
            }}
          >
            <span className="t-label">✕ {t('central.header.logout', 'EXIT')}</span>
          </button>
        </div>
      </header>

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

      {/* Unified Profile Drawer (for Ophthalmologist & District Worker) */}
      {showProfileDrawer && (
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
                {isOphth ? (
                  <>CLINICAL PROFILE // OPHTHALMOLOGIST<br />SPECIALIST LEAD</>
                ) : (
                  <>OFFICER PROFILE // DISTRICT<br />WORKER</>
                )}
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
                    <div className="officer-avatar-circle" style={{ background: isOphth ? '#FEE2E2' : '#CBD5E1', borderColor: '#F4EFEB' }}>
                      {isOphth ? (
                        <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#9E1B1B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      ) : (
                        <svg width="44" height="44" viewBox="0 0 24 24" fill="#9CA3AF">
                          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                        </svg>
                      )}
                    </div>
                  </div>

                  <form onSubmit={handleOfficerSaveProfile} className="officer-form">
                    <h3 className="officer-card-title">
                      {isOphth ? 'EDIT SPECIALIST DETAILS' : 'EDIT WORKER DETAILS'}
                    </h3>
                    
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

                    <div className="officer-form-field">
                      <label className="officer-sublabel">
                        {isOphth ? 'MEDICAL REGISTRATION / LICENSE' : 'WORKER / EMPLOYEE ID'}
                      </label>
                      <input
                        type="text"
                        className="officer-input"
                        value={profile.officerId}
                        onChange={(e) => setProfile({ ...profile, officerId: e.target.value })}
                        required
                      />
                    </div>

                    <div className="officer-form-field">
                      <label className="officer-sublabel">
                        {isOphth ? 'BASE HOSPITAL / CLINIC LOCATION' : 'DISTRICT REGION'}
                      </label>
                      <input
                        type="text"
                        className="officer-input"
                        value={profile.district}
                        onChange={(e) => setProfile({ ...profile, district: e.target.value })}
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
                    <div className="officer-avatar-circle" style={{ background: isOphth ? '#FEE2E2' : '#CBD5E1', borderColor: '#F4EFEB' }}>
                      {isOphth ? (
                        <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#9E1B1B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      ) : (
                        <svg width="44" height="44" viewBox="0 0 24 24" fill="#9CA3AF">
                          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                        </svg>
                      )}
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
                /* The exact Profile Card matching the district worker reference layout */
                <div className="officer-card">
                  {/* Circular Avatar */}
                  <div className="officer-avatar-wrap">
                    <div className="officer-avatar-circle" style={{ background: isOphth ? '#FEE2E2' : '#CBD5E1', borderColor: '#F4EFEB' }}>
                      {isOphth ? (
                        <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#9E1B1B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      ) : (
                        <svg width="44" height="44" viewBox="0 0 24 24" fill="#9CA3AF">
                          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                        </svg>
                      )}
                    </div>
                  </div>

                  {/* Name & Designation */}
                  <h2 className="officer-name">{profile.name}</h2>
                  <div className="officer-designation-header">{profile.designation}</div>

                  {/* Identification & Access / Credentials */}
                  <div className="officer-section-title">
                    {isOphth ? 'Identification & Clinical Credentials' : 'Identification & Access'}
                  </div>
                  <div className="officer-field">
                    <div className="officer-field-label">DESIGNATION & ROLE</div>
                    <div className="officer-field-val">{profile.designation}</div>
                  </div>

                  <div className="officer-field">
                    <div className="officer-field-label">
                      {isOphth ? 'MEDICAL REGISTRATION / LICENSE NO' : 'WORKER ID'}
                    </div>
                    <div className="officer-field-val officer-field-val--crimson">
                      {profile.officerId}
                    </div>
                  </div>

                  <div className="officer-field">
                    <div className="officer-field-label">
                      {isOphth ? 'CLINICAL PRIVILEGE LEVEL' : 'SECURITY CLEARANCE'}
                    </div>
                    <div className="officer-clearance-badge">
                      {isOphth ? 'LEVEL 5 - APEX DIAGNOSTIC LEAD' : 'LEVEL 4 - DISTRICT CHIEF'}
                    </div>
                  </div>

                  {/* Regional / Hospital Assignment */}
                  <div className="officer-section-title">
                    {isOphth ? 'Hospital & Network Assignment' : 'Regional Assignment'}
                  </div>
                  <div className="officer-field">
                    <div className="officer-field-label">
                      {isOphth ? 'BASE HOSPITAL / APEX CLINIC' : 'DISTRICT REGION'}
                    </div>
                    <div className="officer-field-val">{profile.district}</div>
                  </div>

                  <div className="officer-field">
                    <div className="officer-field-label">
                      {isOphth ? 'CONNECTED TELE-RETINA NODES' : 'ASSIGNED PHCs'}
                    </div>
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

                  {isOphth && (
                    <div className="officer-field" style={{ marginTop: '8px' }}>
                      <div className="officer-field-label">CLINICAL SPECIALTY FOCUS</div>
                      <div className="officer-field-val" style={{ fontSize: '12px', lineHeight: 1.4 }}>
                        Medical Retina, Diabetic Retinopathy (ICDR) & AI-Assisted Tele-Grading
                      </div>
                    </div>
                  )}

                  {/* Contact Details */}
                  <div className="officer-section-title">
                    {isOphth ? 'Contact & Consultation Details' : 'Contact Details'}
                  </div>
                  <div className="officer-field">
                    <div className="officer-field-label">Contact Email</div>
                    <div className="officer-field-val">{profile.email}</div>
                  </div>

                  <div className="officer-field">
                    <div className="officer-field-label">
                      {isOphth ? 'Direct Line / Clinic Ext.' : 'Direct Line'}
                    </div>
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

export { CentralHeader };
