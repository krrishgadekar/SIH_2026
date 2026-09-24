import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { CentralHeader } from './CentralHeader';

export const CentralLayout = ({ role, userProfile, onUpdateProfile, onLogout }) => {
  // Scroll progress + header glass effect
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = docHeight > 0 ? scrollTop / docHeight : 0;
      document.documentElement.style.setProperty('--scroll-progress', progress.toFixed(4));
      
      const header = document.querySelector('.app-header');
      if (header) {
        if (scrollTop > 10) {
          header.classList.add('app-header--scrolled');
        } else {
          header.classList.remove('app-header--scrolled');
        }
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="app-layout">
      {/* Scroll Progress Bar */}
      <div className="scroll-progress">
        <div className="scroll-progress__bar" />
      </div>
      <CentralHeader role={role} userProfile={userProfile} onUpdateProfile={onUpdateProfile} onLogout={onLogout} />
      <main className="app-main">
        <Outlet context={{ role, userProfile, onUpdateProfile, onLogout }} />
      </main>
    </div>
  );
};
