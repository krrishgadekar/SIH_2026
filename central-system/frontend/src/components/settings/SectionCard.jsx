import React from 'react';

export const SectionCard = ({
  id,
  title,
  icon,
  badge,
  children
}) => {
  return (
    <section id={id} className="settings-card">
      <div className="settings-card__header">
        <h2 className="settings-card__title">
          {icon && <span className="settings-card__title-icon">{icon}</span>}
          {title}
        </h2>
        {badge && (
          <span className="settings-chip">
            {badge}
          </span>
        )}
      </div>
      <div className="settings-card__body">
        {children}
      </div>
    </section>
  );
};
