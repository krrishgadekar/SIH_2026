import React from 'react';
import { qualityReasonMessages } from '../../api/mockData';

export const QualityResultPanel = ({ result, onRetake, onAccept }) => {
  const isPass = result.qualityStatus === 'pass';
  const isRetake = result.qualityStatus === 'retake';
  const isBorderline = result.qualityStatus === 'borderline';

  let panelClass = 'quality-result';
  let title = '';
  let icon = '';

  if (isPass) {
    panelClass += ' quality-result--pass';
    title = 'QUALITY PASS';
    icon = '✓';
  } else if (isRetake) {
    panelClass += ' quality-result--retake';
    title = 'RETAKE REQUIRED';
    icon = '✕';
  } else if (isBorderline) {
    panelClass += ' quality-result--borderline';
    title = 'BORDERLINE QUALITY';
    icon = '⚠';
  }

  return (
    <div className={panelClass}>
      <div className="quality-result__icon">{icon}</div>
      <div className="quality-result__status">{title}</div>
      
      {result.issues && result.issues.length > 0 ? (
        <div className="quality-result__reason u-mt-2">
          {result.issues.map(issue => qualityReasonMessages[issue] || issue).join(', ')}
        </div>
      ) : result.qualityReason && (
        <div className="quality-result__reason u-mt-2">
          {qualityReasonMessages[result.qualityReason] || result.qualityReason}
        </div>
      )}

      <div className="u-flex u-justify-between u-mt-8">
        <button className="btn btn--outline" style={{ color: 'white', borderColor: 'white' }} onClick={onRetake}>
          RETAKE IMAGE
        </button>
        {!isRetake && (
          <button className={`btn ${isPass ? 'btn--success' : ''}`} onClick={onAccept}>
            ACCEPT & CONTINUE ✦
          </button>
        )}
      </div>
    </div>
  );
};
