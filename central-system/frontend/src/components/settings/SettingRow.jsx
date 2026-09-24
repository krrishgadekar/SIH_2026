import React from 'react';

export const SettingRow = ({
  title,
  hint,
  control,
  fullWidth = false,
  isAction = false,
  isWarn = false,
  onClick
}) => {
  if (fullWidth) {
    return (
      <div className="settings-row settings-row--stacked">
        <div className="settings-row__info">
          <div className="settings-row__title">{title}</div>
          {hint && <div className="settings-row__hint">{hint}</div>}
        </div>
        <div className="settings-row__full-control">
          {control}
        </div>
      </div>
    );
  }

  if (isAction) {
    const handleKeyDown = (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (onClick) onClick();
      }
    };

    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={handleKeyDown}
        className={`settings-row settings-row--clickable ${isWarn ? 'settings-row--warn' : ''}`}
      >
        <div className="settings-row__info">
          <div className="settings-row__title">{title}</div>
          {hint && <div className="settings-row__hint">{hint}</div>}
        </div>
        <div className="settings-row__control">
          {control || <span className="settings-row__chevron">›</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="settings-row">
      <div className="settings-row__info">
        <div className="settings-row__title">{title}</div>
        {hint && <div className="settings-row__hint">{hint}</div>}
      </div>
      <div className="settings-row__control">
        {control}
      </div>
    </div>
  );
};
