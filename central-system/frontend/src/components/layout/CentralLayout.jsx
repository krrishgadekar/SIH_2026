import React from 'react';
import { Outlet } from 'react-router-dom';
import { CentralHeader } from './CentralHeader';

export const CentralLayout = ({ role, onLogout }) => {
  return (
    <div className="app-layout">
      <CentralHeader role={role} onLogout={onLogout} />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
};
