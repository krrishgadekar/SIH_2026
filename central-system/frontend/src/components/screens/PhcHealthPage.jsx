import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { centralApi } from '../../api/centralApiClient';

// 3-State Sort Header Component (Matching Reference Image 2)
const SortHeader = React.memo(({ label, field, sortKey, sortDir, onSort, alignRight = false }) => {
  const isSorted = sortKey === field && sortDir !== 'none';
  return (
    <th
      className={`th-sortable ${alignRight ? 'u-text-right' : ''}`}
      onClick={() => onSort(field)}
      title={`Sort by ${label} (Current: ${isSorted ? sortDir.toUpperCase() : 'DEFAULT'})`}
    >
      <span className="th-sort-inner" style={alignRight ? { justifyContent: 'flex-end' } : {}}>
        <span>{label}</span>
        <span className={`th-sort-icon ${isSorted ? 'th-sort-icon--active' : ''}`}>
          {sortKey === field && sortDir === 'asc'
            ? '↑'
            : sortKey === field && sortDir === 'desc'
            ? '↓'
            : '⇅'}
        </span>
      </span>
    </th>
  );
});
SortHeader.displayName = 'SortHeader';

// Memoized row component for zero-lag rendering
const PhcRow = React.memo(({ phc }) => {
  const isOnline = phc.status === 'online';
  const syncAge = phc.lastSyncAt ? (Date.now() - new Date(phc.lastSyncAt).getTime()) / 1000 / 60 : Infinity;
  const healthScore = isOnline && phc.pendingCount < 5 ? 'GOOD' : isOnline ? 'DEGRADED' : 'OFFLINE';

  return (
    <tr style={!isOnline ? { opacity: 0.85, background: 'rgba(0,0,0,0.02)' } : {}}>
      <td>
        <div className={`sync-dot ${isOnline ? 'sync-dot--online' : 'sync-dot--offline'}`} />
      </td>
      <td className="t-mono" style={{ fontWeight: 700 }}>{phc.phcName}</td>
      <td className="t-mono" style={{ color: 'var(--c-text-muted)', fontWeight: 500 }}>{phc.phcId}</td>
      <td className="t-mono u-text-right" style={{ fontSize: 'var(--fs-tiny)', color: 'var(--c-text-muted)' }}>
        {phc.lastSyncAt
          ? new Date(phc.lastSyncAt).toLocaleString('en-IN', {
              day: '2-digit',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })
          : 'NEVER'}
        {syncAge > 60 && syncAge < Infinity && (
          <span style={{ color: 'var(--c-warning)', marginLeft: 'var(--sp-2)', fontWeight: 700 }}>
            ({Math.round(syncAge / 60)}h ago)
          </span>
        )}
      </td>
      <td className="u-text-right">
        <span className={`badge ${phc.pendingCount === 0 ? 'badge--pass' : phc.pendingCount > 5 ? 'badge--fail' : 'badge--warning'}`}>
          {phc.pendingCount}
        </span>
      </td>
      <td className="t-mono u-text-right" style={{ fontWeight: 700 }}>
        {phc.totalScreened.toLocaleString()}
      </td>
      <td>
        <span className={`badge ${healthScore === 'GOOD' ? 'badge--pass' : healthScore === 'DEGRADED' ? 'badge--warning' : 'badge--fail'}`}>
          {healthScore}
        </span>
      </td>
    </tr>
  );
});
PhcRow.displayName = 'PhcRow';

export const PhcHealthPage = () => {
  const [phcList, setPhcList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  // 3-State Column Sorting
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'none' });

  useEffect(() => {
    centralApi.getPhcSyncStatuses().then(data => {
      setPhcList(data);
      setLoading(false);
    });
  }, []);

  const handleSort = useCallback((field) => {
    setSortConfig(prev => {
      if (prev.key !== field) {
        return { key: field, direction: 'asc' };
      }
      if (prev.direction === 'asc') {
        return { key: field, direction: 'desc' };
      }
      if (prev.direction === 'desc') {
        return { key: null, direction: 'none' };
      }
      return { key: field, direction: 'asc' };
    });
  }, []);

  const onlineCount = useMemo(() => phcList.filter(p => p.status === 'online').length, [phcList]);
  const offlineCount = useMemo(() => phcList.length - onlineCount, [phcList, onlineCount]);
  const totalPending = useMemo(() => phcList.reduce((sum, p) => sum + p.pendingCount, 0), [phcList]);
  const totalScreened = useMemo(() => phcList.reduce((sum, p) => sum + p.totalScreened, 0), [phcList]);

  const processedPhcs = useMemo(() => {
    let list = phcList;
    if (statusFilter === 'online') list = list.filter(p => p.status === 'online');
    if (statusFilter === 'offline') list = list.filter(p => p.status === 'offline');
    if (statusFilter === 'pending') list = list.filter(p => p.pendingCount > 0);

    if (sortConfig.direction === 'none' || !sortConfig.key) {
      return list;
    }

    return [...list].sort((a, b) => {
      let valA = a[sortConfig.key];
      let valB = b[sortConfig.key];

      if (sortConfig.key === 'lastSyncAt') {
        valA = valA ? new Date(valA).getTime() : 0;
        valB = valB ? new Date(valB).getTime() : 0;
      } else if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }

      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [phcList, statusFilter, sortConfig]);

  if (loading) {
    return (
      <div className="section">
        <div className="skeleton" style={{ height: '40px', width: '300px', marginBottom: 'var(--sp-6)' }} />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="skeleton" style={{ height: '100px', marginBottom: 'var(--sp-2)' }} />
        ))}
      </div>
    );
  }

  return (
    <div className="section">
      <div className="u-flex u-items-center u-justify-between u-mb-6">
        <div>
          <p className="section__subtitle">DISTRICT ADMIN</p>
          <h1 className="section__title" style={{ marginBottom: 0 }}>PHC HEALTH</h1>
        </div>
        {/* Interactive filter badges */}
        <div className="u-flex u-gap-3 u-items-center">
          {sortConfig.direction !== 'none' && (
            <button
              className="btn btn--secondary"
              style={{ padding: 'var(--sp-1) var(--sp-3)', fontSize: 'var(--fs-tiny)' }}
              onClick={() => setSortConfig({ key: null, direction: 'none' })}
              title="Reset sorting to default"
            >
              RESET SORT (✕)
            </button>
          )}
          <button
            onClick={() => setStatusFilter('all')}
            className={`btn ${statusFilter === 'all' ? 'btn--primary' : 'btn--secondary'}`}
            style={{
              padding: 'var(--sp-1) var(--sp-3)',
              fontSize: 'var(--fs-tiny)',
              boxShadow: statusFilter === 'all' ? '3px 3px 0px #000' : '2px 2px 0px var(--c-crimson)',
            }}
          >
            ALL ({phcList.length})
          </button>
          <button
            onClick={() => setStatusFilter(statusFilter === 'online' ? 'all' : 'online')}
            className={`badge badge--pass ${statusFilter === 'online' ? 'badge--active' : ''}`}
            style={{
              cursor: 'pointer',
              border: statusFilter === 'online' ? '2px solid #000' : '1px solid currentColor',
              boxShadow: statusFilter === 'online' ? '3px 3px 0px #000' : 'none',
              transform: statusFilter === 'online' ? 'translate(-1px, -1px)' : 'none',
            }}
            title="Filter by Online PHCs"
          >
            {onlineCount} ONLINE
          </button>
          <button
            onClick={() => setStatusFilter(statusFilter === 'offline' ? 'all' : 'offline')}
            className={`badge badge--fail ${statusFilter === 'offline' ? 'badge--active' : ''}`}
            style={{
              cursor: 'pointer',
              border: statusFilter === 'offline' ? '2px solid #000' : '1px solid currentColor',
              boxShadow: statusFilter === 'offline' ? '3px 3px 0px #000' : 'none',
              transform: statusFilter === 'offline' ? 'translate(-1px, -1px)' : 'none',
            }}
            title="Filter by Offline PHCs"
          >
            {offlineCount} OFFLINE
          </button>
          <button
            onClick={() => setStatusFilter(statusFilter === 'pending' ? 'all' : 'pending')}
            className={`badge badge--neutral ${statusFilter === 'pending' ? 'badge--active' : ''}`}
            style={{
              cursor: 'pointer',
              border: statusFilter === 'pending' ? '2px solid #000' : '1px solid currentColor',
              boxShadow: statusFilter === 'pending' ? '3px 3px 0px #000' : 'none',
              transform: statusFilter === 'pending' ? 'translate(-1px, -1px)' : 'none',
            }}
            title="Filter by PHCs with Pending Sync"
          >
            {totalPending} PENDING
          </button>
        </div>
      </div>

      {/* Summary Stats - 3 Key Metric Cards with brutalist shadow and clean borders */}
      <div className="bento u-mb-6">
        <div className="bento--span-4">
          <div className="stat" style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '4px 4px 0px var(--c-crimson)' }}>
            <div className="stat__label">TOTAL PHCs</div>
            <div className="stat__value">{phcList.length}</div>
          </div>
        </div>
        <div className="bento--span-4">
          <div className="stat" style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '4px 4px 0px var(--c-crimson)' }}>
            <div className="stat__label">TOTAL SCREENED</div>
            <div className="stat__value">{totalScreened.toLocaleString()}</div>
          </div>
        </div>
        <div className="bento--span-4">
          <div className="stat" style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '4px 4px 0px var(--c-crimson)' }}>
            <div className="stat__label">PENDING SYNC</div>
            <div className="stat__value" style={{ color: totalPending > 0 ? 'var(--c-crimson-dark)' : 'var(--c-success)' }}>
              {totalPending}
            </div>
          </div>
        </div>
      </div>

      {/* PHC Table wrapped in responsive horizontal scroll wrapper */}
      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <SortHeader
                label="STATUS"
                field="status"
                sortKey={sortConfig.key}
                sortDir={sortConfig.direction}
                onSort={handleSort}
              />
              <SortHeader
                label="PHC NAME"
                field="phcName"
                sortKey={sortConfig.key}
                sortDir={sortConfig.direction}
                onSort={handleSort}
              />
              <SortHeader
                label="PHC ID"
                field="phcId"
                sortKey={sortConfig.key}
                sortDir={sortConfig.direction}
                onSort={handleSort}
              />
              <SortHeader
                label="LAST SYNC"
                field="lastSyncAt"
                sortKey={sortConfig.key}
                sortDir={sortConfig.direction}
                onSort={handleSort}
                alignRight={true}
              />
              <SortHeader
                label="PENDING"
                field="pendingCount"
                sortKey={sortConfig.key}
                sortDir={sortConfig.direction}
                onSort={handleSort}
                alignRight={true}
              />
              <SortHeader
                label="TOTAL SCREENED"
                field="totalScreened"
                sortKey={sortConfig.key}
                sortDir={sortConfig.direction}
                onSort={handleSort}
                alignRight={true}
              />
              <th>HEALTH</th>
            </tr>
          </thead>
          <tbody>
            {processedPhcs.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: 'var(--sp-8)', color: 'var(--c-text-muted)' }}>
                  NO PHCs MATCH THE SELECTED FILTER
                </td>
              </tr>
            ) : (
              processedPhcs.map(phc => (
                <PhcRow key={phc.phcId} phc={phc} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
