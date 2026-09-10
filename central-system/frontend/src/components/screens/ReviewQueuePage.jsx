import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { centralApi } from '../../api/centralApiClient';
import { drGradeLabels } from '../../api/mockData';
import { InfoBanner } from '../shared/InfoBanner';

const SortHeader = ({ label, sortKey, currentSort, onRequestSort, width }) => {
  const active = currentSort.key === sortKey;
  const direction = currentSort.direction;
  
  return (
    <th onClick={() => onRequestSort(sortKey)} style={{ cursor: 'pointer', userSelect: 'none', width: width, transition: 'background 0.2s' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center' }}>
        {label}
        <svg 
          width="16" height="16" viewBox="0 0 24 24" 
          fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ 
            marginLeft: '6px', 
            opacity: active ? 1 : 0.3,
            transition: 'opacity 0.2s',
          }}
        >
          <g style={{ opacity: active && direction === 'asc' ? 1 : (active ? 0.3 : 0.7) }}>
            <path d="M8 18V6M4 10l4-4 4 4" />
          </g>
          <g style={{ opacity: active && direction === 'desc' ? 1 : (active ? 0.3 : 0.7) }}>
            <path d="M16 6v12M12 14l4 4 4-4" />
          </g>
        </svg>
      </div>
    </th>
  );
};

const TierBadge = ({ tier }) => {
  const cls = tier === 'C' ? 'badge badge--tier-c' : 'badge badge--tier-b';
  return <span className={cls}>TIER {tier}</span>;
};

const ConfidenceBar = ({ value }) => {
  const pct = Math.round(value * 100);
  const barClass = pct < 70 ? 'bar__fill--danger' : pct < 85 ? 'bar__fill--warning' : 'bar__fill--success';
  return (
    <div className="u-flex u-items-center u-gap-2" style={{ minWidth: '120px' }}>
      <div className="bar" style={{ flex: 1 }}>
        <div className={`bar__fill ${barClass}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="t-mono" style={{ fontSize: 'var(--fs-tiny)', minWidth: '32px' }}>{pct}%</span>
    </div>
  );
};

export const ReviewQueuePage = () => {
  const { t } = useTranslation();
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, tier-c, tier-b, disagreement
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const navigate = useNavigate();

  // Search and filter state (matching ReferralTrackerPage pattern)
  const [searchQuery, setSearchQuery] = useState('');
  const [phcFilter, setPhcFilter] = useState('all');
  const [gradeFilter, setGradeFilter] = useState('all');

  useEffect(() => {
    centralApi.getOphthQueue().then(data => {
      setQueue(data);
      setLoading(false);
    });
  }, []);

  // Extract unique PHC names for dropdown
  const phcOptions = useMemo(() => {
    return Array.from(new Set(queue.map(q => q.phcName).filter(Boolean))).sort();
  }, [queue]);

  const filteredQueue = useMemo(() => {
    let list = queue;

    // Tier / disagreement filter
    if (filter === 'tier-c') list = list.filter(item => item.conformalTier === 'C');
    if (filter === 'tier-b') list = list.filter(item => item.conformalTier === 'B');
    if (filter === 'disagreement') list = list.filter(item => item.branchAgreement === false);

    // PHC filter
    if (phcFilter !== 'all') {
      list = list.filter(item => item.phcName === phcFilter);
    }

    // Grade filter
    if (gradeFilter !== 'all') {
      list = list.filter(item => String(item.drGradeCnn) === String(gradeFilter));
    }

    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(item =>
        (item.patientName && item.patientName.toLowerCase().includes(q)) ||
        (item.patientReference && item.patientReference.toLowerCase().includes(q)) ||
        (item.phcName && item.phcName.toLowerCase().includes(q)) ||
        (item.caseId && item.caseId.toLowerCase().includes(q))
      );
    }

    return list;
  }, [queue, filter, phcFilter, gradeFilter, searchQuery]);

  const sortedQueue = useMemo(() => {
    let sortableItems = [...filteredQueue];
    if (sortConfig.key !== null) {
      sortableItems.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        if (sortConfig.key === 'drGradeCnn' || sortConfig.key === 'drGradeRuleEngine') {
            aValue = aValue !== null ? aValue : -1;
            bValue = bValue !== null ? bValue : -1;
        } else if (sortConfig.key === 'branchAgreement') {
            aValue = aValue === true ? 2 : aValue === false ? 1 : 0;
            bValue = bValue === true ? 2 : bValue === false ? 1 : 0;
        } else if (sortConfig.key === 'confidenceScore') {
            aValue = aValue || 0;
            bValue = bValue || 0;
        } else if (typeof aValue === 'string') {
            aValue = aValue.toLowerCase();
            bValue = (bValue || '').toLowerCase();
        }

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [filteredQueue, sortConfig]);

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const tierCCount = queue.filter(q => q.conformalTier === 'C').length;
  const tierBCount = queue.filter(q => q.conformalTier === 'B').length;
  const disagreeCount = queue.filter(q => q.branchAgreement === false).length;

  const hasActiveFilters = searchQuery.trim() !== '' || phcFilter !== 'all' || gradeFilter !== 'all' || filter !== 'all';

  const handleResetFilters = useCallback(() => {
    setSearchQuery('');
    setPhcFilter('all');
    setGradeFilter('all');
    setFilter('all');
    setSortConfig({ key: null, direction: 'asc' });
  }, []);

  if (loading) {
    return (
      <div className="section">
        <div className="skeleton" style={{ height: '40px', width: '300px', marginBottom: 'var(--sp-4)' }} />
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
          <p className="section__subtitle">{t('central.queue.subtitle', 'OPHTHALMOLOGIST INTERFACE')}</p>
          <h1 className="section__title" style={{ marginBottom: 0 }}>{t('central.queue.title', 'REVIEW QUEUE')}</h1>
        </div>
        <div className="u-flex u-items-center u-gap-3">
          <span className="badge badge--neutral">{queue.length} {t('central.queue.stats.total', 'TOTAL')}</span>
          <span className="badge badge--tier-c">{tierCCount} {t('central.queue.stats.tierC', 'TIER C')}</span>
          <span className="badge badge--tier-b">{tierBCount} {t('central.queue.stats.tierB', 'TIER B')}</span>
          {disagreeCount > 0 && <span className="badge badge--fail">⚠ {disagreeCount} {t('central.queue.stats.mismatch', 'MISMATCH')}</span>}
        </div>
      </div>

      <InfoBanner 
        title={t('central.queue.banner.title', 'QUEUE PRIORITIZATION')}
        text={t('central.queue.banner.text', 'Cases are automatically sorted by urgency. Tier C cases and branch disagreements are floated to the top, followed by lowest confidence scores. Spot-check Tier B cases appear last.')}
      />

      {/* Search & Multi-Filter Bar (matching ReferralTrackerPage) */}
      <div className="panel u-mb-4" style={{ padding: 'var(--sp-4)', border: 'var(--border)' }}>
        <div className="u-flex u-items-center u-gap-3" style={{ flexWrap: 'wrap' }}>
          {/* Search Input */}
          <div style={{ flex: '1 1 200px', minWidth: '180px' }}>
            <input
              type="text"
              className="input"
              placeholder={t('central.queue.search.placeholder', '🔍 Search Patient Ref, Case ID, or PHC...')}
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
              <option value="all">{t('central.queue.search.allPhcs', 'ALL PHCs')}</option>
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
              <option value="all">{t('central.queue.search.allGrades', 'ALL GRADES')}</option>
              <option value="4">Grade 4 (PDR)</option>
              <option value="3">Grade 3 (Severe)</option>
              <option value="2">Grade 2 (Moderate)</option>
              <option value="1">Grade 1 (Mild)</option>
              <option value="0">Grade 0 (No DR)</option>
            </select>
          </div>

          {/* Mismatch Chip */}
          <button
            className={`badge ${filter === 'disagreement' ? 'badge--fail' : 'badge--neutral'}`}
            style={{
              height: '38px',
              padding: '0 12px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 'var(--fs-tiny)',
              border: filter === 'disagreement' ? '2px solid #000' : '1px solid var(--c-crimson)',
              background: filter === 'disagreement' ? 'var(--c-crimson)' : 'rgba(168, 34, 34, 0.08)',
              color: filter === 'disagreement' ? '#FFF' : 'var(--c-crimson)',
              boxShadow: filter === 'disagreement' ? '2px 2px 0px #000' : 'none',
              transition: 'all 0.15s ease',
            }}
            onClick={() => setFilter(filter === 'disagreement' ? 'all' : 'disagreement')}
            title="Filter to branch mismatch cases"
          >
            {t('central.queue.search.mismatchChip', '⚠ MISMATCH')} ({disagreeCount})
          </button>

          {/* Reset Filters */}
          {hasActiveFilters && (
            <button
              className="btn btn--secondary"
              style={{ height: '38px', padding: '0 12px', fontSize: 'var(--fs-tiny)' }}
              onClick={handleResetFilters}
              title="Reset all active search and filters"
            >
              {t('central.queue.search.reset', 'RESET (✕)')}
            </button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="queue-filter-bar u-mb-4">
        {[
          { id: 'all', label: t('central.queue.filters.all', 'ALL CASES') },
          { id: 'tier-c', label: t('central.queue.filters.tierC', 'TIER C — FULL REVIEW') },
          { id: 'tier-b', label: t('central.queue.filters.tierB', 'TIER B — SPOT CHECK') },
          { id: 'disagreement', label: t('central.queue.filters.mismatch', '⚠ BRANCH MISMATCH') },
        ].map(f => (
          <button
            key={f.id}
            className={`queue-filter-btn ${filter === f.id ? 'queue-filter-btn--active' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Queue Table */}
      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <SortHeader width="40px" label={t('central.queue.table.colPriority', '#')} sortKey="priorityRank" currentSort={sortConfig} onRequestSort={requestSort} />
              <th>{t('central.queue.table.colPatientRef', 'PATIENT REF')}</th>
              <th>{t('central.queue.table.colPhc', 'PHC')}</th>
              <SortHeader label={t('central.queue.table.colTier', 'TIER')} sortKey="conformalTier" currentSort={sortConfig} onRequestSort={requestSort} />
              <SortHeader label={t('central.queue.table.colCnnGrade', 'CNN GRADE')} sortKey="drGradeCnn" currentSort={sortConfig} onRequestSort={requestSort} />
              <SortHeader label={t('central.queue.table.colRuleEngine', 'RULE ENGINE')} sortKey="drGradeRuleEngine" currentSort={sortConfig} onRequestSort={requestSort} />
              <SortHeader label={t('central.queue.table.colAgreement', 'AGREEMENT')} sortKey="branchAgreement" currentSort={sortConfig} onRequestSort={requestSort} />
              <SortHeader label={t('central.queue.table.colConfidence', 'CONFIDENCE')} sortKey="confidenceScore" currentSort={sortConfig} onRequestSort={requestSort} />
              <th>{t('central.queue.table.colCaptured', 'CAPTURED')}</th>
            </tr>
          </thead>
          <tbody>
            {sortedQueue.map((item, idx) => (
              <tr
                key={item.caseId}
                className="clickable"
                onClick={() => navigate(`/ophth/case/${item.caseId}`)}
                style={item.branchAgreement === false ? { borderLeft: '3px solid var(--c-crimson-dark)' } : {}}
              >
                <td className="t-mono" style={{ opacity: 0.4 }}>{item.priorityRank}</td>
                <td>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-h)' }}>
                    {item.patientName || item.patientReference}
                  </div>
                  <div className="t-mono" style={{ fontSize: '11px', opacity: 0.6 }}>
                    {item.patientReference} {item.patientAge ? `• ${item.patientAge}Y` : ''}
                  </div>
                </td>
                <td className="t-mono">{item.phcName}</td>
                <td><TierBadge tier={item.conformalTier} /></td>
                <td>
                  <span className="t-mono" style={{ fontWeight: 700 }}>
                    {t('central.queue.table.grade', 'Grade')} {item.drGradeCnn}
                  </span>
                  <br />
                  <span className="t-label" style={{ opacity: 0.5 }}>
                    {drGradeLabels[item.drGradeCnn] || '—'}
                  </span>
                </td>
                <td>
                  {item.drGradeRuleEngine !== null ? (
                    <>
                      <span className="t-mono" style={{ fontWeight: 700 }}>
                        {t('central.queue.table.grade', 'Grade')} {item.drGradeRuleEngine}
                      </span>
                      <br />
                      <span className="t-label" style={{ opacity: 0.5 }}>
                        {drGradeLabels[item.drGradeRuleEngine] || '—'}
                      </span>
                    </>
                  ) : (
                    <span className="t-mono" style={{ opacity: 0.3 }}>{t('central.queue.table.notAvailable', 'NOT YET AVAILABLE')}</span>
                  )}
                </td>
                <td>
                  {item.branchAgreement === null ? (
                    <span className="t-mono" style={{ opacity: 0.3 }}>{t('central.queue.table.na', 'N/A')}</span>
                  ) : item.branchAgreement ? (
                    <span className="badge badge--pass">{t('central.queue.table.agree', '✓ AGREE')}</span>
                  ) : (
                    <span className="badge badge--fail">{t('central.queue.table.disagree', '⚠ DISAGREE')}</span>
                  )}
                </td>
                <td><ConfidenceBar value={item.confidenceScore} /></td>
                <td className="t-mono" style={{ fontSize: 'var(--fs-tiny)', opacity: 0.5 }}>
                  {new Date(item.capturedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sortedQueue.length === 0 && (
        <div className="u-text-center u-p-6" style={{ border: 'var(--border)', borderTop: 'none' }}>
          <p className="t-mono" style={{ opacity: 0.4 }}>{t('central.queue.empty', 'NO CASES MATCH FILTER')}</p>
        </div>
      )}
    </div>
  );
};
