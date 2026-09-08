import React, { useState, useEffect } from 'react';
import { centralApi } from '../../api/centralApiClient';

const statusConfig = {
  referred: { label: 'REFERRED', badge: 'badge--warning', next: 'contacted' },
  contacted: { label: 'CONTACTED', badge: 'badge--neutral', next: 'attended' },
  attended: { label: 'ATTENDED', badge: 'badge--pass', next: null },
  lost: { label: 'LOST TO FOLLOW-UP', badge: 'badge--fail', next: null },
};

export const ReferralTrackerPage = () => {
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    centralApi.getReferrals().then(data => {
      setReferrals(data);
      setLoading(false);
    });
  }, []);

  const filtered = referrals.filter(r =>
    filter === 'all' || r.status === filter
  );

  const statusCounts = {
    referred: referrals.filter(r => r.status === 'referred').length,
    contacted: referrals.filter(r => r.status === 'contacted').length,
    attended: referrals.filter(r => r.status === 'attended').length,
    lost: referrals.filter(r => r.status === 'lost').length,
  };

  const handleAdvance = async (referral) => {
    const nextStatus = statusConfig[referral.status]?.next;
    if (!nextStatus) return;

    const updated = await centralApi.updateReferral(referral.referralId, {
      status: nextStatus,
      assignedWorker: referral.assignedWorker || 'ASHA-UNASSIGNED',
    });
    setReferrals(prev => prev.map(r => r.referralId === referral.referralId ? { ...r, ...updated } : r));
  };

  if (loading) {
    return (
      <div className="section">
        <div className="skeleton" style={{ height: '40px', width: '300px', marginBottom: 'var(--sp-6)' }} />
        {[...Array(5)].map((_, i) => <div key={i} className="skeleton" style={{ height: '60px', marginBottom: 'var(--sp-2)' }} />)}
      </div>
    );
  }

  return (
    <div className="section">
      <div className="u-flex u-items-center u-justify-between u-mb-6">
        <div>
          <p className="section__subtitle">DISTRICT ADMIN</p>
          <h1 className="section__title" style={{ marginBottom: 0 }}>REFERRAL TRACKER</h1>
        </div>
      </div>

      {/* Pipeline Visualization */}
      <div className="referral-pipeline u-mb-6">
        {Object.entries(statusConfig).map(([status, config], idx) => (
          <React.Fragment key={status}>
            <button
              className={`referral-pipeline__stage ${filter === status ? 'referral-pipeline__stage--active' : ''}`}
              onClick={() => setFilter(filter === status ? 'all' : status)}
            >
              <span className="referral-pipeline__count">{statusCounts[status]}</span>
              <span className="referral-pipeline__label t-label">{config.label}</span>
            </button>
            {idx < Object.keys(statusConfig).length - 1 && (
              <span className="referral-pipeline__arrow">→</span>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Referral Table */}
      <div style={{ border: 'var(--border)' }}>
        <table className="table">
          <thead>
            <tr>
              <th>PATIENT REF</th>
              <th>PHC</th>
              <th>DR GRADE</th>
              <th>STATUS</th>
              <th>ASSIGNED WORKER</th>
              <th>LAST UPDATED</th>
              <th>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(ref => {
              const config = statusConfig[ref.status];
              return (
                <tr key={ref.referralId}>
                  <td className="t-mono" style={{ fontWeight: 700 }}>{ref.patientReference}</td>
                  <td className="t-mono">{ref.phcName}</td>
                  <td>
                    <span className={`badge ${ref.drGrade >= 3 ? 'badge--fail' : ref.drGrade >= 2 ? 'badge--warning' : 'badge--pass'}`}>
                      GRADE {ref.drGrade}
                    </span>
                  </td>
                  <td><span className={`badge ${config.badge}`}>{config.label}</span></td>
                  <td className="t-mono">{ref.assignedWorker || <span style={{ opacity: 0.3 }}>UNASSIGNED</span>}</td>
                  <td className="t-mono" style={{ fontSize: 'var(--fs-tiny)', opacity: 0.5 }}>
                    {new Date(ref.updatedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td>
                    {config.next && (
                      <button
                        className="btn"
                        style={{ padding: 'var(--sp-1) var(--sp-3)', fontSize: 'var(--fs-tiny)' }}
                        onClick={() => handleAdvance(ref)}
                      >
                        <span>→ {statusConfig[config.next]?.label}</span>
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
