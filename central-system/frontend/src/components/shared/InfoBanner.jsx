import React from 'react';

export const InfoBanner = ({ title, text }) => {
  return (
    <div 
      className="u-mb-6" 
      style={{ 
        border: '1px solid var(--c-crimson, #cc0000)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ background: 'var(--c-crimson, #cc0000)', color: '#fff', padding: 'var(--sp-2) var(--sp-4)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontWeight: 700 }}>ℹ</span>
        <span className="t-mono" style={{ fontSize: 'var(--fs-small)', fontWeight: 700, letterSpacing: '1px' }}>
          {title || 'PAGE INFO'}
        </span>
      </div>
      <div style={{ padding: 'var(--sp-4)', background: 'var(--bg, #f4f3ec)' }}>
        <p className="t-mono" style={{ fontSize: 'var(--fs-small)', opacity: 0.9, color: 'var(--text, #000)', margin: 0 }}>
          {text}
        </p>
      </div>
    </div>
  );
};
