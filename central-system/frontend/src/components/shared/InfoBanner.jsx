import React from 'react';

export const InfoBanner = ({ title, text, children }) => {
  return (
    <div
      className="u-mb-6"
      style={{
        border: '2px solid var(--c-crimson, #cc0000)',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '4px 4px 0px rgba(0,0,0,0.05)',
      }}
    >
      <div style={{ background: 'var(--c-crimson, #cc0000)', color: '#fff', padding: 'var(--sp-2) var(--sp-4)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'serif', fontStyle: 'italic', fontWeight: 'bold', fontSize: '14px',
          width: '20px', height: '20px', border: '1px solid white', borderRadius: '50%'
        }}>
          i
        </span>
        <span className="t-mono" style={{ fontSize: 'var(--fs-small)', fontWeight: 700, letterSpacing: '1px' }}>
          {title || 'PAGE INFO'}
        </span>
      </div>
      <div style={{ padding: 'var(--sp-4)', background: 'var(--bg, #f4f3ec)' }}>
        {children ? (
          <div className="t-mono" style={{ fontSize: '11px', color: 'var(--text, #000)', lineHeight: '1.5' }}>
            {children}
          </div>
        ) : (
          <p className="t-mono" style={{ fontSize: 'var(--fs-small)', opacity: 0.9, color: 'var(--text, #000)', margin: 0 }}>
            {text}
          </p>
        )}
      </div>
    </div>
  );
};
