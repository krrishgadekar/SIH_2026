import React from 'react';
import { Outlet } from 'react-router-dom';
import { CentralHeader } from './CentralHeader';

export const CentralLayout = ({ role, userProfile, onUpdateProfile, onLogout }) => {
  return (
    <div className="app-layout">
      <CentralHeader role={role} userProfile={userProfile} onUpdateProfile={onUpdateProfile} onLogout={onLogout} />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
};
