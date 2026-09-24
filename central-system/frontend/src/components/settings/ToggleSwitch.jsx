import React from 'react';

export const ToggleSwitch = ({
  checked = false,
  onChange,
  id,
  ariaLabel,
  disabled = false
}) => {
  const handleKeyDown = (e) => {
    if (disabled) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onChange(!checked);
    }
  };

  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      className="settings-toggle"
      onClick={() => !disabled && onChange(!checked)}
      onKeyDown={handleKeyDown}
    >
      <span className="settings-toggle__knob" />
    </button>
  );
};
