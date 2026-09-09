import React from 'react';
import { useTranslation } from 'react-i18next';

const languages = [
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'हिंदी' },
  { code: 'mr', name: 'मराठी' },
  { code: 'te', name: 'తెలుగు' },
  { code: 'ta', name: 'தமிழ்' },
  { code: 'pa', name: 'ਪੰਜਾਬੀ' },
  { code: 'bn', name: 'বাংলা' }
];

export const LanguageSelector = () => {
  const { i18n } = useTranslation();

  const handleLanguageChange = (e) => {
    i18n.changeLanguage(e.target.value);
  };

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <select 
        className="select input--on-dark" 
        style={{ 
          paddingRight: '1rem', 
          paddingLeft: '2rem', 
          fontSize: '0.8rem', 
          height: '32px',
          backgroundColor: 'transparent',
          border: '1px solid var(--border)',
          cursor: 'pointer',
          appearance: 'none',
          WebkitAppearance: 'none'
        }}
        value={i18n.language.split('-')[0]} 
        onChange={handleLanguageChange}
        title="Change Language"
      >
        {languages.map((lng) => (
          <option key={lng.code} value={lng.code}>
            {lng.code.toUpperCase()}
          </option>
        ))}
      </select>
      <div style={{ position: 'absolute', left: '0.5rem', pointerEvents: 'none', opacity: 0.7 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          <path d="M2 12h20" />
        </svg>
      </div>
    </div>
  );
};
