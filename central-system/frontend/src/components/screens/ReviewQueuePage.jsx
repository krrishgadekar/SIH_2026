import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, tier-c, tier-b, disagreement
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const navigate = useNavigate();

  useEffect(() => {
    centralApi.getOphthQueue().then(data => {
      setQueue(data);
      setLoading(false);
    });
  }, []);

  const filteredQueue = queue.filter(item => {
    if (filter === 'tier-c') return item.conformalTier === 'C';
    if (filter === 'tier-b') return item.conformalTier === 'B';
    if (filter === 'disagreement') return item.branchAgreement === false;
    return true;
  });

  const sortedQueue = React.useMemo(() => {
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
          <p className="section__subtitle">OPHTHALMOLOGIST INTERFACE</p>
          <h1 className="section__title" style={{ marginBottom: 0 }}>REVIEW QUEUE</h1>
        </div>
        <div className="u-flex u-gap-2">
          <span className="badge badge--neutral">{queue.length} TOTAL</span>
          <span className="badge badge--tier-c">{tierCCount} TIER C</span>
          <span className="badge badge--tier-b">{tierBCount} TIER B</span>
          {disagreeCount > 0 && <span className="badge badge--fail">⚠ {disagreeCount} MISMATCH</span>}
        </div>
      </div>

      <InfoBanner 
        title="QUEUE PRIORITIZATION" 
        text="Cases are automatically sorted by urgency. Tier C cases and branch disagreements are floated to the top, followed by lowest confidence scores. Spot-check Tier B cases appear last." 
      />

      {/* Filter Bar */}
      <div className="queue-filter-bar u-mb-4">
        {[
          { id: 'all', label: 'ALL CASES' },
          { id: 'tier-c', label: 'TIER C — FULL REVIEW' },
          { id: 'tier-b', label: 'TIER B — SPOT CHECK' },
          { id: 'disagreement', label: '⚠ BRANCH MISMATCH' },
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
      <div style={{ border: 'var(--border)' }}>
        <table className="table">
          <thead>
            <tr>
              <SortHeader width="40px" label="#" sortKey="priorityRank" currentSort={sortConfig} onRequestSort={requestSort} />
              <th>PATIENT REF</th>
              <th>PHC</th>
              <SortHeader label="TIER" sortKey="conformalTier" currentSort={sortConfig} onRequestSort={requestSort} />
              <SortHeader label="CNN GRADE" sortKey="drGradeCnn" currentSort={sortConfig} onRequestSort={requestSort} />
              <SortHeader label="RULE ENGINE" sortKey="drGradeRuleEngine" currentSort={sortConfig} onRequestSort={requestSort} />
              <SortHeader label="AGREEMENT" sortKey="branchAgreement" currentSort={sortConfig} onRequestSort={requestSort} />
              <SortHeader label="CONFIDENCE" sortKey="confidenceScore" currentSort={sortConfig} onRequestSort={requestSort} />
              <th>CAPTURED</th>
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
                  <span className="t-mono" style={{ fontWeight: 700 }}>{item.patientReference}</span>
                </td>
                <td className="t-mono">{item.phcName}</td>
                <td><TierBadge tier={item.conformalTier} /></td>
                <td>
                  <span className="t-mono" style={{ fontWeight: 700 }}>
                    Grade {item.drGradeCnn}
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
                        Grade {item.drGradeRuleEngine}
                      </span>
                      <br />
                      <span className="t-label" style={{ opacity: 0.5 }}>
                        {drGradeLabels[item.drGradeRuleEngine] || '—'}
                      </span>
                    </>
                  ) : (
                    <span className="t-mono" style={{ opacity: 0.3 }}>NOT YET AVAILABLE</span>
                  )}
                </td>
                <td>
                  {item.branchAgreement === null ? (
                    <span className="t-mono" style={{ opacity: 0.3 }}>N/A</span>
                  ) : item.branchAgreement ? (
                    <span className="badge badge--pass">✓ AGREE</span>
                  ) : (
                    <span className="badge badge--fail">⚠ DISAGREE</span>
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
          <p className="t-mono" style={{ opacity: 0.4 }}>NO CASES MATCH FILTER</p>
        </div>
      )}
    </div>
  );
};
