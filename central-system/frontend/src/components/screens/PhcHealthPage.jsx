import React, { useState, useEffect } from 'react';
import { centralApi } from '../../api/centralApiClient';

export const PhcHealthPage = () => {
  const [phcList, setPhcList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    centralApi.getPhcSyncStatuses().then(data => {
      setPhcList(data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="section">
        <div className="skeleton" style={{ height: '40px', width: '300px', marginBottom: 'var(--sp-6)' }} />
        {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: '100px', marginBottom: 'var(--sp-2)' }} />)}
      </div>
    );
  }

  const onlineCount = phcList.filter(p => p.status === 'online').length;
  const totalPending = phcList.reduce((sum, p) => sum + p.pendingCount, 0);
  const totalScreened = phcList.reduce((sum, p) => sum + p.totalScreened, 0);

  return (
    <div className="section">
      <div className="u-flex u-items-center u-justify-between u-mb-6">
        <div>
          <p className="section__subtitle">DISTRICT ADMIN</p>
          <h1 className="section__title" style={{ marginBottom: 0 }}>PHC HEALTH</h1>
        </div>
        <div className="u-flex u-gap-4">
          <span className="badge badge--pass">{onlineCount} ONLINE</span>
          <span className="badge badge--fail">{phcList.length - onlineCount} OFFLINE</span>
          <span className="badge badge--neutral">{totalPending} PENDING</span>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="bento u-mb-6">
        <div className="bento--span-4">
          <div className="stat">
            <div className="stat__label">TOTAL PHCs</div>
            <div className="stat__value">{phcList.length}</div>
          </div>
        </div>
        <div className="bento--span-4">
          <div className="stat">
            <div className="stat__label">TOTAL SCREENED</div>
            <div className="stat__value">{totalScreened.toLocaleString()}</div>
          </div>
        </div>
        <div className="bento--span-4">
          <div className="stat">
            <div className="stat__label">PENDING SYNC</div>
            <div className="stat__value" style={{ color: totalPending > 0 ? 'var(--c-crimson-dark)' : 'var(--c-success)' }}>
              {totalPending}
            </div>
          </div>
        </div>
      </div>

      {/* PHC Table */}
      <div style={{ border: 'var(--border)' }}>
        <table className="table">
          <thead>
            <tr>
              <th>STATUS</th>
              <th>PHC NAME</th>
              <th>PHC ID</th>
              <th>LAST SYNC</th>
              <th>PENDING</th>
              <th>TOTAL SCREENED</th>
              <th>HEALTH</th>
            </tr>
          </thead>
          <tbody>
            {phcList.map(phc => {
              const isOnline = phc.status === 'online';
              const syncAge = phc.lastSyncAt ? (Date.now() - new Date(phc.lastSyncAt).getTime()) / 1000 / 60 : Infinity;
              const healthScore = isOnline && phc.pendingCount < 5 ? 'GOOD' : isOnline ? 'DEGRADED' : 'OFFLINE';

              return (
                <tr key={phc.phcId} style={!isOnline ? { opacity: 0.6 } : {}}>
                  <td>
                    <div className={`sync-dot ${isOnline ? 'sync-dot--online' : 'sync-dot--offline'}`} />
                  </td>
                  <td className="t-mono" style={{ fontWeight: 700 }}>{phc.phcName}</td>
                  <td className="t-mono" style={{ opacity: 0.5 }}>{phc.phcId}</td>
                  <td className="t-mono" style={{ fontSize: 'var(--fs-tiny)' }}>
                    {phc.lastSyncAt
                      ? new Date(phc.lastSyncAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                      : 'NEVER'}
                    {syncAge > 60 && (
                      <span style={{ color: 'var(--c-warning)', marginLeft: 'var(--sp-2)' }}>
                        ({Math.round(syncAge / 60)}h ago)
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${phc.pendingCount === 0 ? 'badge--pass' : phc.pendingCount > 5 ? 'badge--fail' : 'badge--warning'}`}>
                      {phc.pendingCount}
                    </span>
                  </td>
                  <td className="t-mono" style={{ fontWeight: 700 }}>{phc.totalScreened.toLocaleString()}</td>
                  <td>
                    <span className={`badge ${healthScore === 'GOOD' ? 'badge--pass' : healthScore === 'DEGRADED' ? 'badge--warning' : 'badge--fail'}`}>
                      {healthScore}
                    </span>
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
