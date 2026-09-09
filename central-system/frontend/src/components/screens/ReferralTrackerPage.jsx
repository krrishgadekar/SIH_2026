import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { centralApi } from '../../api/centralApiClient';

const statusConfig = {
  referred: { label: 'REFERRED', badge: 'badge--warning', next: 'contacted' },
  contacted: { label: 'CONTACTED', badge: 'badge--neutral', next: 'attended' },
  attended: { label: 'ATTENDED', badge: 'badge--pass', next: null },
  lost: { label: 'LOST TO FOLLOW-UP', badge: 'badge--fail', next: null },
};

// 3-State Sort Header Component (Matching Reference Image 2)
const SortHeader = React.memo(({ label, field, sortKey, sortDir, onSort, alignRight = false }) => {
  const isSorted = sortKey === field && sortDir !== 'none';
  return (
    <th
      className={`th-sortable ${alignRight ? 'u-text-right' : ''}`}
      onClick={() => onSort(field)}
      title={`Sort by ${label} (Current: ${isSorted ? sortDir.toUpperCase() : 'DEFAULT (LOST AT TOP)'})`}
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

// Memoized individual table row for zero-lag updates and DOM optimization
const ReferralRow = React.memo(({ item, onAdvance }) => {
  const config = statusConfig[item.status];
  const nextConfig = config?.next ? statusConfig[config.next] : null;
  const isLost = item.status === 'lost';

  return (
    <tr style={isLost ? { background: 'rgba(168, 34, 34, 0.05)' } : {}}>
      <td className="t-mono" style={{ fontWeight: 700 }}>
        {isLost && <span style={{ color: 'var(--c-crimson)', marginRight: '6px' }} title="Urgent Action Required">●</span>}
        {item.patientReference}
      </td>
      <td className="t-mono">{item.phcName}</td>
      <td>
        <span className={`badge ${item.drGrade >= 3 ? 'badge--fail' : item.drGrade >= 2 ? 'badge--warning' : 'badge--pass'}`}>
          GRADE {item.drGrade}
        </span>
      </td>
      <td>
        <span className={`badge ${config?.badge || 'badge--neutral'}`}>{config?.label}</span>
      </td>
      <td className="t-mono">
        {item.assignedWorker ? (
          <span>{item.assignedWorker}</span>
        ) : (
          <span style={{ color: 'var(--c-text-muted)', fontWeight: 600 }}>UNASSIGNED</span>
        )}
      </td>
      <td className="t-mono u-text-right" style={{ fontSize: 'var(--fs-tiny)', color: 'var(--c-text-muted)' }}>
        {new Date(item.updatedAt).toLocaleString('en-IN', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </td>
      <td>
        {nextConfig ? (
          <button
            className="btn btn--secondary"
            style={{
              padding: 'var(--sp-1) var(--sp-3)',
              fontSize: 'var(--fs-tiny)',
              boxShadow: '2px 2px 0px var(--c-crimson)',
            }}
            onClick={() => onAdvance(item)}
            title={`Advance status to ${nextConfig.label}`}
          >
            <span>→ {nextConfig.label}</span>
          </button>
        ) : (
          <span className="t-label" style={{ color: isLost ? 'var(--c-crimson)' : 'var(--c-text-muted)', fontWeight: isLost ? 700 : 500 }}>
            {isLost ? 'ACTION REQ.' : 'FINAL'}
          </span>
        )}
      </td>
    </tr>
  );
});
ReferralRow.displayName = 'ReferralRow';

export const ReferralTrackerPage = () => {
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);

  // Multi-Filter States (Search, PHC, Grade, Status)
  const [searchQuery, setSearchQuery] = useState('');
  const [phcFilter, setPhcFilter] = useState('all');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [filter, setFilter] = useState('all');

  // 3-State Column Sorting: key + 'asc' | 'desc' | 'none'
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'none' });

  useEffect(() => {
    centralApi.getReferrals().then(data => {
      setReferrals(data);
      setLoading(false);
    });
  }, []);

  const handleAdvance = useCallback(async (referral) => {
    const nextStatus = statusConfig[referral.status]?.next;
    if (!nextStatus) return;

    // Instantly update local state optimistically
    const updated = await centralApi.updateReferral(referral.referralId, {
      status: nextStatus,
      assignedWorker: referral.assignedWorker || 'ASHA-112',
    });
    setReferrals(prev =>
      prev.map(r => (r.referralId === referral.referralId ? { ...r, ...updated } : r))
    );
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

  const statusCounts = useMemo(() => {
    return {
      referred: referrals.filter(r => r.status === 'referred').length,
      contacted: referrals.filter(r => r.status === 'contacted').length,
      attended: referrals.filter(r => r.status === 'attended').length,
      lost: referrals.filter(r => r.status === 'lost').length,
    };
  }, [referrals]);

  const phcOptions = useMemo(() => {
    return Array.from(new Set(referrals.map(r => r.phcName).filter(Boolean))).sort();
  }, [referrals]);

  // Combined Multi-Filtering + 3-State Sorting with Default "Lost to Follow-Up" on Top
  const processedReferrals = useMemo(() => {
    let list = referrals;

    // Status filter
    if (filter !== 'all') {
      list = list.filter(r => r.status === filter);
    }

    // PHC filter
    if (phcFilter !== 'all') {
      list = list.filter(r => r.phcName === phcFilter);
    }

    // Grade filter
    if (gradeFilter !== 'all') {
      list = list.filter(r => String(r.drGrade) === String(gradeFilter));
    }

    // Text search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(r =>
        (r.patientReference && r.patientReference.toLowerCase().includes(q)) ||
        (r.phcName && r.phcName.toLowerCase().includes(q)) ||
        (r.assignedWorker && r.assignedWorker.toLowerCase().includes(q))
      );
    }

    // Sorting: Default sorts "Lost to Follow-up" to the top
    if (sortConfig.direction === 'none' || !sortConfig.key) {
      return [...list].sort((a, b) => {
        if (a.status === 'lost' && b.status !== 'lost') return -1;
        if (b.status === 'lost' && a.status !== 'lost') return 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
    }

    return [...list].sort((a, b) => {
      let valA = a[sortConfig.key];
      let valB = b[sortConfig.key];

      if (sortConfig.key === 'updatedAt') {
        valA = new Date(valA).getTime();
        valB = new Date(valB).getTime();
      } else if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }

      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [referrals, filter, phcFilter, gradeFilter, searchQuery, sortConfig]);

  const hasActiveFilters = filter !== 'all' || phcFilter !== 'all' || gradeFilter !== 'all' || searchQuery.trim() !== '' || sortConfig.direction !== 'none';

  const handleResetFilters = () => {
    setFilter('all');
    setPhcFilter('all');
    setGradeFilter('all');
    setSearchQuery('');
    setSortConfig({ key: null, direction: 'none' });
  };

  if (loading) {
    return (
      <div className="section">
        <div className="skeleton" style={{ height: '40px', width: '300px', marginBottom: 'var(--sp-6)' }} />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="skeleton" style={{ height: '60px', marginBottom: 'var(--sp-2)' }} />
        ))}
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
        <div className="u-flex u-items-center u-gap-3">
          <button
            className={`btn ${filter === 'all' && !hasActiveFilters ? 'btn--primary' : 'btn--secondary'}`}
            style={{
              padding: 'var(--sp-2) var(--sp-4)',
              fontSize: 'var(--fs-tiny)',
              boxShadow: filter === 'all' && !hasActiveFilters ? '3px 3px 0px #000' : '2px 2px 0px var(--c-crimson)',
            }}
            onClick={handleResetFilters}
          >
            SHOW ALL ({referrals.length})
          </button>
        </div>
      </div>

      {/* Pipeline Visualization with Clickable 4 Summary Numbers */}
      <div className="referral-pipeline u-mb-6">
        {Object.entries(statusConfig).map(([status, config], idx) => (
          <React.Fragment key={status}>
            <button
              className={`referral-pipeline__stage ${filter === status ? 'referral-pipeline__stage--active' : ''}`}
              onClick={() => setFilter(filter === status ? 'all' : status)}
              title={`Click to filter by ${config.label} (${statusCounts[status]} cases)`}
              style={filter === status ? { boxShadow: '3px 3px 0px #000' } : {}}
            >
              <span className="referral-pipeline__count">{statusCounts[status] || 0}</span>
              <span className="referral-pipeline__label t-label">{config.label}</span>
            </button>
            {idx < Object.keys(statusConfig).length - 1 && (
              <span className="referral-pipeline__arrow">→</span>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Scale-Ready Search & Multi-Filter Bar with Urgent Lost Filter */}
      <div className="panel u-mb-4" style={{ padding: 'var(--sp-4)', border: 'var(--border)' }}>
        <div className="u-flex u-items-center u-gap-3" style={{ flexWrap: 'wrap' }}>
          {/* Search Input */}
          <div style={{ flex: '1 1 200px', minWidth: '180px' }}>
            <input
              type="text"
              className="input"
              placeholder="🔍 Search Patient Ref, Worker, or PHC..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ height: '38px', fontSize: 'var(--fs-tiny)' }}
            />
          </div>

          {/* PHC Filter Dropdown */}
          <div style={{ width: '160px' }}>
            <select
              className="select"
              value={phcFilter}
              onChange={(e) => setPhcFilter(e.target.value)}
              style={{ height: '38px', fontSize: 'var(--fs-tiny)' }}
            >
              <option value="all">ALL PHCs</option>
              {phcOptions.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Grade Filter Dropdown */}
          <div style={{ width: '150px' }}>
            <select
              className="select"
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              style={{ height: '38px', fontSize: 'var(--fs-tiny)' }}
            >
              <option value="all">ALL GRADES</option>
              <option value="4">Grade 4 (PDR)</option>
              <option value="3">Grade 3 (Severe)</option>
              <option value="2">Grade 2 (Moderate)</option>
              <option value="1">Grade 1 (Mild)</option>
              <option value="0">Grade 0 (No DR)</option>
            </select>
          </div>

          {/* Status Filter Dropdown */}
          <div style={{ width: '170px' }}>
            <select
              className="select"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{ height: '38px', fontSize: 'var(--fs-tiny)' }}
            >
              <option value="all">ALL STATUSES</option>
              <option value="referred">REFERRED</option>
              <option value="contacted">CONTACTED</option>
              <option value="attended">ATTENDED</option>
              <option value="lost">LOST TO FOLLOW-UP</option>
            </select>
          </div>

          {/* Urgent Chip: Lost to Follow-up */}
          <button
            className={`badge ${filter === 'lost' ? 'badge--fail' : 'badge--neutral'}`}
            style={{
              height: '38px',
              padding: '0 12px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 'var(--fs-tiny)',
              border: filter === 'lost' ? '2px solid #000' : '1px solid var(--c-crimson)',
              background: filter === 'lost' ? 'var(--c-crimson)' : 'rgba(168, 34, 34, 0.08)',
              color: filter === 'lost' ? '#FFF' : 'var(--c-crimson)',
              boxShadow: filter === 'lost' ? '2px 2px 0px #000' : 'none',
              transition: 'all 0.15s ease',
            }}
            onClick={() => setFilter(filter === 'lost' ? 'all' : 'lost')}
            title="Filter directly to urgent cases lost to follow-up"
          >
            ⚠ URGENT: LOST ({statusCounts.lost})
          </button>

          {/* Reset Filters Shortcut */}
          {hasActiveFilters && (
            <button
              className="btn btn--secondary"
              style={{ height: '38px', padding: '0 12px', fontSize: 'var(--fs-tiny)' }}
              onClick={handleResetFilters}
              title="Reset all active search and filters"
            >
              RESET (✕)
            </button>
          )}
        </div>
      </div>

      {/* Referral Table wrapped in responsive horizontal scroll wrapper */}
      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <SortHeader
                label="PATIENT REF"
                field="patientReference"
                sortKey={sortConfig.key}
                sortDir={sortConfig.direction}
                onSort={handleSort}
              />
              <SortHeader
                label="PHC"
                field="phcName"
                sortKey={sortConfig.key}
                sortDir={sortConfig.direction}
                onSort={handleSort}
              />
              <SortHeader
                label="DR GRADE"
                field="drGrade"
                sortKey={sortConfig.key}
                sortDir={sortConfig.direction}
                onSort={handleSort}
              />
              <SortHeader
                label="STATUS"
                field="status"
                sortKey={sortConfig.key}
                sortDir={sortConfig.direction}
                onSort={handleSort}
              />
              <SortHeader
                label="ASSIGNED WORKER"
                field="assignedWorker"
                sortKey={sortConfig.key}
                sortDir={sortConfig.direction}
                onSort={handleSort}
              />
              <SortHeader
                label="LAST UPDATED"
                field="updatedAt"
                sortKey={sortConfig.key}
                sortDir={sortConfig.direction}
                onSort={handleSort}
                alignRight={true}
              />
              <th>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {processedReferrals.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: 'var(--sp-8)', color: 'var(--c-text-muted)' }}>
                  NO REFERRALS FOUND MATCHING CRITERIA
                </td>
              </tr>
            ) : (
              processedReferrals.map(ref => (
                <ReferralRow
                  key={ref.referralId}
                  item={ref}
                  onAdvance={handleAdvance}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
