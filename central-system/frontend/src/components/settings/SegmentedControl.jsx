import React from 'react';

export const SegmentedControl = ({
  options = [],
  value,
  onChange,
  id,
  ariaLabel
}) => {
  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={ariaLabel}
      className="settings-segmented"
    >
      {options.map((opt) => {
        const optValue = typeof opt === 'object' ? opt.value : opt;
        const optLabel = typeof opt === 'object' ? opt.label : opt;
        const isSelected = value === optValue;

        const handleKeyDown = (e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            onChange(optValue);
          }
        };

        return (
          <button
            key={optValue}
            type="button"
            role="radio"
            aria-checked={isSelected}
            tabIndex={0}
            className="settings-segmented__btn"
            onClick={() => onChange(optValue)}
            onKeyDown={handleKeyDown}
          >
            {optLabel}
          </button>
        );
      })}
    </div>
  );
};
