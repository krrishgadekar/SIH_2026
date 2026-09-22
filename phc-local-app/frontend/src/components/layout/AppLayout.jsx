import React from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';

export const AppLayout = ({ auth, onLogout }) => {
  return (
    <div className="app-layout">
      <Header auth={auth} onLogout={onLogout} />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
};

