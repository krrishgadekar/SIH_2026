import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { localApi } from '../../api/localApiClient';
import { PHC_NAME } from '../../config';
import { ConsoleStatus } from '../shared/ConsoleStatus';

export const Header = () => {
  const [syncStatus, setSyncStatus] = useState({ online: false, pendingCount: 0 });

  useEffect(() => {
    // Poll sync status
    const fetchSync = async () => {
      try {
        const status = await localApi.getSyncStatus();
        setSyncStatus(status);
      } catch (err) {
        console.error('Failed to get sync status', err);
        setSyncStatus(prev => ({ ...prev, online: false }));
      }
    };
    
    fetchSync();
    const interval = setInterval(fetchSync, 10000);
    return () => clearInterval(interval);
  }, []);

  const toggleContrast = () => {
    const root = document.documentElement;
    const current = root.getAttribute('data-contrast');
    if (current === 'dark') {
      root.removeAttribute('data-contrast');
    } else {
      root.setAttribute('data-contrast', 'dark');
    }
  };

  return (
    <header className="app-header">
      {/* Brand */}
      <div className="app-logo">
        DR<span className="star">✦</span>AI
      </div>
      
      {/* Terminal Output */}
      <div style={{ flex: 1 }}>
        <ConsoleStatus />
      </div>
      
      {/* Navigation */}
      <nav className="app-nav">
        <NavLink to="/register" className={({isActive}) => isActive ? "app-nav__link active" : "app-nav__link"}>
          Register
        </NavLink>
        <NavLink to="/capture" className={({isActive}) => isActive ? "app-nav__link active" : "app-nav__link"}>
          Capture
        </NavLink>
        <NavLink to="/queue" className={({isActive}) => isActive ? "app-nav__link active" : "app-nav__link"}>
          Queue
        </NavLink>
      </nav>
      
      {/* Contrast Toggle */}
      <div>
        <button onClick={toggleContrast} title="Toggle Contrast Mode">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor" />
          </svg>
        </button>
      </div>

      {/* Sync Status & PHC Info */}
      <div>
        <div className="u-flex-col">
          <span className="t-mono" style={{ fontSize: '10px' }}>{PHC_NAME}</span>
          <div className="sync-badge u-mt-1">
            <div className={`sync-dot ${syncStatus.online ? 'sync-dot--online' : 'sync-dot--offline'}`}></div>
            <span>{syncStatus.online ? 'ONLINE' : 'OFFLINE'}</span>
            <span style={{ opacity: 0.5, marginLeft: '4px' }}>
              ● {syncStatus.pendingCount} PENDING
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
