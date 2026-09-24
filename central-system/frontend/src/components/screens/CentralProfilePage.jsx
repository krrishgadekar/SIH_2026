import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { CentralProfileDrawer } from '../shared/CentralProfileDrawer';

export const CentralProfilePage = ({ role: directRole, userProfile: directProfile, onUpdateProfile: directUpdate, onLogout: directLogout }) => {
  // Can get props either directly or from OutletContext
  const context = useOutletContext() || {};
  const role = directRole || context.role || 'ophthalmologist';
  const userProfile = directProfile || context.userProfile;
  const onUpdateProfile = directUpdate || context.onUpdateProfile;
  const onLogout = directLogout || context.onLogout;

  return (
    <div className="retro-profile-page-wrapper">
      <CentralProfileDrawer
        isOpen={true}
        isEmbeddedPage={true}
        role={role}
        userProfile={userProfile}
        onUpdateProfile={onUpdateProfile}
        onLogout={onLogout}
      />
    </div>
  );
};
