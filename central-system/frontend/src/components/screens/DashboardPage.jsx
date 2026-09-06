import React, { useState, useEffect, useRef } from 'react';
import { centralApi } from '../../api/centralApiClient';
import { Chart, registerables } from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';

Chart.register(...registerables);

// Custom chart defaults for our theme
Chart.defaults.color = '#E61A3C';
Chart.defaults.borderColor = 'rgba(0, 0, 0, 0.15)';
Chart.defaults.font.family = "'JetBrains Mono', monospace";
Chart.defaults.font.size = 11;

const StatCard = ({ label, value, delta, suffix = '' }) => (
  <div className="stat hash-fill">
    <div className="stat__label">{label}</div>
    <div className="stat__value">{value}{suffix}</div>
    {delta && <div className="stat__delta" style={{ color: delta.startsWith('+') ? 'var(--c-success)' : 'var(--c-warning)' }}>{delta}</div>}
  </div>
);

export const DashboardPage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    centralApi.getAdminDashboard().then(d => {
      setData(d);
      setLoading(false);
    });
  }, []);

  if (loading) {
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

  // Chart data
  const gradeChartData = {
    labels: data.drGradeDistribution.map(d => d.label),
    datasets: [{
      data: data.drGradeDistribution.map(d => d.count),
      backgroundColor: [
        '#00D4AA',  // No DR
        '#4DB8CC',  // Mild
        '#FF8800',  // Moderate
        '#E61A3C',  // Severe
        '#8B1025',  // PDR
      ],
      borderColor: '#000000',
      borderWidth: 1,
    }],
  };

  const weeklyChartData = {
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

  const phcBarData = {
    labels: data.casesPerPhc.map(p => p.phcName.replace('PHC ', '')),
    datasets: [{
      label: 'Cases Today',
      data: data.casesPerPhc.map(p => p.count),
      backgroundColor: data.casesPerPhc.map((_, i) =>
        `rgba(230, 26, 60, ${0.5 + i * 0.15})`
      ),
      borderColor: '#000000',
      borderWidth: 1,
    }],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      x: {
        grid: { color: 'rgba(0, 0, 0, 0.08)' },
        ticks: { color: 'rgba(22, 0, 0, 0.55)' },
      },
      y: {
        grid: { color: 'rgba(0, 0, 0, 0.08)' },
        ticks: { color: 'rgba(22, 0, 0, 0.55)' },
      },
    },
  };

  return (
    <div className="section">
      <div className="u-flex u-items-center u-justify-between u-mb-6">
        <div>
          <p className="section__subtitle">DISTRICT ADMIN</p>
          <h1 className="section__title" style={{ marginBottom: 0 }}>DASHBOARD</h1>
        </div>
        <span className="t-mono" style={{ opacity: 0.4 }}>
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
      </div>

      {/* Stat Cards — Bento Grid */}
      <div className="bento u-mb-6">
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

      {/* Second Row — Model Performance */}
      <div className="bento u-mb-6">
        <div className="bento--span-6">
          <StatCard label="MODEL ACCURACY" value={(data.modelAccuracy * 100).toFixed(1)} suffix="%" />
        </div>
        <div className="bento--span-6">
          <StatCard label="OVERRIDE RATE" value={(data.overrideRate * 100).toFixed(1)} suffix="%" delta="Target: < 10%" />
        </div>
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
        {/* Weekly Trend */}
        <div style={{ border: 'var(--border)', padding: 'var(--sp-6)' }}>
          <h3 className="t-h3 u-mb-4">WEEKLY SCREENING TREND</h3>
          <div style={{ height: '280px' }}>
            <Line data={weeklyChartData} options={{
              ...chartOptions,
              plugins: {
                ...chartOptions.plugins,
                legend: { display: true, labels: { color: 'rgba(22,0,0,0.6)', font: { family: "'JetBrains Mono'", size: 10 } } },
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

      {/* DR Grade Distribution */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 0, marginTop: 0 }}>
        <div style={{ border: 'var(--border)', padding: 'var(--sp-6)' }}>
          <h3 className="t-h3 u-mb-4">DR GRADE DISTRIBUTION</h3>
          <div style={{ height: '250px', display: 'flex', justifyContent: 'center' }}>
            <Doughnut data={gradeChartData} options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { position: 'bottom', labels: { color: 'rgba(22,0,0,0.6)', font: { family: "'JetBrains Mono'", size: 10 }, padding: 12 } },
              },
            }} />
          </div>
        </div>

        {/* Grade breakdown table */}
        <div style={{ border: 'var(--border)' }}>
          <table className="table">
            <thead>
              <tr>
                <th>GRADE</th>
                <th>CLASSIFICATION</th>
                <th>COUNT</th>
                <th>PERCENTAGE</th>
                <th>DISTRIBUTION</th>
              </tr>
            </thead>
            <tbody>
              {data.drGradeDistribution.map(d => (
                <tr key={d.grade}>
                  <td className="t-mono" style={{ fontWeight: 700 }}>Grade {d.grade}</td>
                  <td className="t-mono">{d.label}</td>
                  <td className="t-mono" style={{ fontWeight: 700 }}>{d.count}</td>
                  <td className="t-mono">{d.percentage}%</td>
                  <td>
                    <div className="bar" style={{ width: '100%' }}>
                      <div className="bar__fill" style={{
                        width: `${d.percentage}%`,
                        background: ['#00D4AA', '#4DB8CC', '#FF8800', '#E61A3C', '#8B1025'][d.grade],
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
