import React from 'react';
import { Outlet } from 'react-router-dom';
import { CentralHeader } from './CentralHeader';
import { BinarySeparator } from '../shared/BinarySeparator';

export const CentralLayout = ({ role, onLogout }) => {
  return (
    <div className="app-layout">
      <CentralHeader role={role} onLogout={onLogout} />
      <BinarySeparator />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
};
