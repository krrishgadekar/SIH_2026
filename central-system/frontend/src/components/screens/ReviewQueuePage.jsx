import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { centralApi } from '../../api/centralApiClient';
import { drGradeLabels } from '../../api/mockData';

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
              <th style={{ width: '40px' }}>#</th>
              <th>PATIENT REF</th>
              <th>PHC</th>
              <th>TIER</th>
              <th>CNN GRADE</th>
              <th>RULE ENGINE</th>
              <th>AGREEMENT</th>
              <th>CONFIDENCE</th>
              <th>CAPTURED</th>
            </tr>
          </thead>
          <tbody>
            {filteredQueue.map((item, idx) => (
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

      {filteredQueue.length === 0 && (
        <div className="u-text-center u-p-6" style={{ border: 'var(--border)', borderTop: 'none' }}>
          <p className="t-mono" style={{ opacity: 0.4 }}>NO CASES MATCH FILTER</p>
        </div>
      )}
    </div>
  );
};
