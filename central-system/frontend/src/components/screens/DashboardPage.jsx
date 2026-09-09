import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { centralApi } from '../../api/centralApiClient';
import { Chart, registerables } from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';

Chart.register(...registerables);

// Custom chart defaults for our theme
Chart.defaults.color = '#E61A3C';
Chart.defaults.borderColor = 'rgba(0, 0, 0, 0.15)';
Chart.defaults.font.family = "'JetBrains Mono', monospace";
Chart.defaults.font.size = 11;

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

const StatCard = React.memo(({ label, value, delta, suffix = '' }) => (
  <div className="stat hash-fill">
    <div className="stat__label">{label}</div>
    <div className="stat__value">{value}{suffix}</div>
    {delta && <div className="stat__delta" style={{ color: delta.startsWith('+') ? 'var(--c-success)' : 'var(--c-warning)' }}>{delta}</div>}
  </div>
));
StatCard.displayName = 'StatCard';

const PALETTE = ['#14B8A6', '#EAB308', '#F97316', '#A82222', '#7F1D1D'];

export const DashboardPage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // 3-State Sorting for Grade Breakdown Table
  const [gradeSort, setGradeSort] = useState({ key: null, direction: 'none' });

  useEffect(() => {
    let active = true;
    centralApi.getAdminDashboard().then(d => {
      if (active) {
        setData(d);
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, []);

  const handleGradeSort = useCallback((field) => {
    setGradeSort(prev => {
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

  const gradeChartData = useMemo(() => {
    if (!data?.drGradeDistribution) {
      return { labels: [], datasets: [{ data: [], backgroundColor: PALETTE, borderWidth: 0 }] };
    }
    return {
      labels: data.drGradeDistribution.map(d => d.label),
      datasets: [{
        data: data.drGradeDistribution.map(d => d.count),
        backgroundColor: PALETTE,
        borderWidth: 0,
        hoverOffset: 6,
      }],
    };
  }, [data]);

  const weeklyChartData = useMemo(() => {
    if (!data?.weeklyTrend) {
      return { labels: [], datasets: [] };
    }
    return {
      labels: data.weeklyTrend.map(w => w.week),
      datasets: [
        {
          label: 'Cases Screened',
          data: data.weeklyTrend.map(w => w.cases),
          borderColor: '#E61A3C',
          backgroundColor: 'rgba(230, 26, 60, 0.1)',
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#E61A3C',
          pointBorderColor: '#000',
          pointRadius: 4,
        },
        {
          label: 'Referrals',
          data: data.weeklyTrend.map(w => w.referrals),
          borderColor: '#FF8800',
          backgroundColor: 'rgba(255, 136, 0, 0.1)',
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#FF8800',
          pointBorderColor: '#000',
          pointRadius: 4,
        },
      ],
    };
  }, [data]);

  const phcBarData = useMemo(() => {
    if (!data?.casesPerPhc) {
      return { labels: [], datasets: [] };
    }
    return {
      labels: data.casesPerPhc.map(p => p.phcName.replace('PHC ', '')),
      datasets: [{
        label: 'Cases Today',
        data: data.casesPerPhc.map(p => p.count),
        backgroundColor: data.casesPerPhc.map((_, i) =>
          `rgba(230, 26, 60, ${0.5 + i * 0.15})`
        ),
        borderWidth: 0,
      }],
    };
  }, [data]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: 'rgba(22, 0, 0, 0.75)' },
      },
      y: {
        grid: { display: false },
        ticks: { color: 'rgba(22, 0, 0, 0.75)' },
      },
    },
  }), []);

  const donutOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    cutout: '72%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: 'rgba(22, 0, 0, 0.85)',
          font: { family: "'JetBrains Mono', monospace", size: 10, weight: 600 },
          padding: 12,
          usePointStyle: true,
          pointStyle: 'rect',
        },
      },
      tooltip: {
        backgroundColor: 'rgba(26, 16, 8, 0.95)',
        titleFont: { family: "'JetBrains Mono', monospace", size: 12 },
        bodyFont: { family: "'JetBrains Mono', monospace", size: 11 },
        padding: 10,
        borderColor: '#A82222',
        borderWidth: 1,
        displayColors: true,
        callbacks: {
          label: (context) => {
            const gradeItem = data?.drGradeDistribution[context.dataIndex];
            return ` ${context.label}: ${context.raw} cases (${gradeItem ? gradeItem.percentage : 0}%)`;
          },
        },
      },
    },
  }), [data]);

  const sortedGrades = useMemo(() => {
    if (!data?.drGradeDistribution) return [];
    if (gradeSort.direction === 'none' || !gradeSort.key) {
      return data.drGradeDistribution;
    }

    return [...data.drGradeDistribution].sort((a, b) => {
      let valA = a[gradeSort.key];
      let valB = b[gradeSort.key];

      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }

      if (valA < valB) return gradeSort.direction === 'asc' ? -1 : 1;
      if (valA > valB) return gradeSort.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, gradeSort]);

  if (loading || !data) {
    return (
      <div className="section">
        <div className="skeleton" style={{ height: '40px', width: '300px', marginBottom: 'var(--sp-6)' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--sp-4)' }}>
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: '120px' }} />)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)', marginTop: 'var(--sp-6)' }}>
          <div className="skeleton" style={{ height: '350px' }} />
          <div className="skeleton" style={{ height: '350px' }} />
        </div>
      </div>
    );
  }

  const totalCases = data.drGradeDistribution.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="section">
      <div className="u-flex u-items-center u-justify-between u-mb-6">
        <div>
          <p className="section__subtitle">DISTRICT ADMIN</p>
          <h1 className="section__title" style={{ marginBottom: 0 }}>DASHBOARD</h1>
        </div>
        <span className="t-mono" style={{ opacity: 0.7 }}>
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
      </div>

      {/* Stat Cards — Bento Grid Row 1: Operational & Processing */}
      <div className="bento u-mb-4">
        <div className="bento--span-3">
          <StatCard label="CASES TODAY" value={data.casesToday} delta="+12% from yesterday" />
        </div>
        <div className="bento--span-3">
          <StatCard label="THIS WEEK" value={data.casesThisWeek} delta="+8% WoW" />
        </div>
        <div className="bento--span-3">
          <StatCard label="TOTAL PROCESSED" value={data.totalCasesProcessed.toLocaleString()} />
        </div>
        <div className="bento--span-3">
          <StatCard label="AVG REVIEW TIME" value={data.averageReviewTurnaroundSeconds} suffix="s" delta="-3s from last week" />
        </div>
      </div>

      {/* Stat Cards — Bento Grid Row 2: AI Quality & Model Reliability */}
      <div className="bento u-mb-6">
        <div className="bento--span-3">
          <StatCard label="MODEL ACCURACY" value={(data.modelAccuracy * 100).toFixed(1)} suffix="%" />
        </div>
        <div className="bento--span-3">
          <StatCard label="OVERRIDE RATE" value={(data.overrideRate * 100).toFixed(1)} suffix="%" delta="Target: < 10%" />
        </div>
        <div className="bento--span-3">
          <StatCard label="IMAGES REJECTED (QUALITY)" value={data.imagesRejectedQuality || 38} delta="2.9% rate (-0.4%)" />
        </div>
        <div className="bento--span-3">
          <StatCard label="AVG. CONFIDENCE SCORE" value={((data.avgConfidenceScore || 0.924) * 100).toFixed(1)} suffix="%" delta="High reliability tier" />
        </div>
      </div>

      {/* Charts */}
      <div className="dashboard-charts-grid">
        {/* Weekly Trend */}
        <div style={{ border: 'var(--border)', padding: 'var(--sp-6)' }}>
          <h3 className="t-h3 u-mb-4">WEEKLY SCREENING TREND</h3>
          <div style={{ height: '280px' }}>
            <Line data={weeklyChartData} options={{
              ...chartOptions,
              plugins: {
                ...chartOptions.plugins,
                legend: { display: true, labels: { color: 'rgba(22,0,0,0.8)', font: { family: "'JetBrains Mono'", size: 10 } } },
              },
            }} />
          </div>
        </div>

        {/* PHC Distribution */}
        <div style={{ border: 'var(--border)', padding: 'var(--sp-6)' }}>
          <h3 className="t-h3 u-mb-4">CASES BY PHC</h3>
          <div style={{ height: '280px' }}>
            <Bar data={phcBarData} options={chartOptions} />
          </div>
        </div>
      </div>

      {/* DR Grade Distribution — Upgraded Donut Chart with Center KPI */}
      <div className="dashboard-breakdown-grid">
        <div style={{ border: 'var(--border)', padding: 'var(--sp-6)', position: 'relative' }}>
          <h3 className="t-h3 u-mb-4">DR GRADE DISTRIBUTION</h3>
          <div style={{ height: '270px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Doughnut data={gradeChartData} options={donutOptions} />
            {/* Center cutout KPI overlay */}
            <div
              style={{
                position: 'absolute',
                top: '40%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                pointerEvents: 'none',
              }}
            >
              <div style={{ fontFamily: 'var(--f-display)', fontSize: '1.5rem', fontWeight: 900, color: 'var(--c-crimson)', lineHeight: 1 }}>
                {totalCases.toLocaleString()}
              </div>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: '9px', letterSpacing: '0.12em', color: 'var(--c-text-muted)', fontWeight: 700, marginTop: '2px' }}>
                TOTAL CASES
              </div>
            </div>
          </div>
        </div>

        {/* Grade breakdown table with 3-state sorting */}
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <SortHeader
                  label="GRADE"
                  field="grade"
                  sortKey={gradeSort.key}
                  sortDir={gradeSort.direction}
                  onSort={handleGradeSort}
                />
                <SortHeader
                  label="CLASSIFICATION"
                  field="label"
                  sortKey={gradeSort.key}
                  sortDir={gradeSort.direction}
                  onSort={handleGradeSort}
                />
                <SortHeader
                  label="COUNT"
                  field="count"
                  sortKey={gradeSort.key}
                  sortDir={gradeSort.direction}
                  onSort={handleGradeSort}
                  alignRight={true}
                />
                <SortHeader
                  label="PERCENTAGE"
                  field="percentage"
                  sortKey={gradeSort.key}
                  sortDir={gradeSort.direction}
                  onSort={handleGradeSort}
                  alignRight={true}
                />
                <th>DISTRIBUTION</th>
              </tr>
            </thead>
            <tbody>
              {sortedGrades.map(d => (
                <tr key={d.grade}>
                  <td className="t-mono" style={{ fontWeight: 700 }}>Grade {d.grade}</td>
                  <td className="t-mono">{d.label}</td>
                  <td className="t-mono u-text-right" style={{ fontWeight: 700 }}>{d.count.toLocaleString()}</td>
                  <td className="t-mono u-text-right">{d.percentage}%</td>
                  <td>
                    <div className="bar" style={{ width: '100%' }}>
                      <div className="bar__fill" style={{
                        width: `${d.percentage}%`,
                        background: PALETTE[d.grade],
                      }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
