import React from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { BinarySeparator } from '../shared/BinarySeparator';

export const AppLayout = () => {
  return (
    <div className="app-layout">
      <Header />
      <BinarySeparator />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
};
