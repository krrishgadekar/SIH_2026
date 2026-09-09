import React from 'react';
import { useTranslation } from 'react-i18next';
import { InfoBanner } from '../shared/InfoBanner';

const StatCard = ({ title, value, subtext, trend, isWarning }) => (
  <div className="panel u-p-4" style={{ border: isWarning ? '1px solid var(--c-danger)' : '1px solid var(--border)' }}>
    <h3 className="t-mono u-mb-2" style={{ fontSize: 'var(--fs-small)', opacity: 0.6 }}>{title}</h3>
    <div className="u-flex u-items-baseline u-gap-2 u-mb-2">
      <span className="t-h2" style={{ color: isWarning ? 'var(--c-danger)' : 'inherit' }}>{value}</span>
      {trend && (
        <span className="t-mono" style={{ fontSize: 'var(--fs-tiny)', color: trend > 0 ? 'var(--c-success)' : 'var(--c-danger)' }}>
          {trend > 0 ? '▲' : '▼'} {Math.abs(trend)}%
        </span>
      )}
    </div>
    <p className="t-mono" style={{ fontSize: 'var(--fs-tiny)', opacity: 0.5 }}>{subtext}</p>
  </div>
);

export const ProgramHealthPage = () => {
  const { t } = useTranslation();

  return (
    <div className="section">
      <div className="u-flex u-items-center u-justify-between u-mb-6">
        <div>
          <h1 className="t-h1 u-mb-2">{t('central.programHealth.title', 'PROGRAM HEALTH')}</h1>
          <div className="t-mono" style={{ opacity: 0.8 }}>
            {t('central.programHealth.subtitle', 'DISTRICT WIDE STATISTICS & MODEL DRIFT')}
          </div>
        </div>
        <div className="u-flex u-gap-2">
          <span className="badge badge--success">{t('central.programHealth.status.optimal', 'SYSTEM OPTIMAL')}</span>
          <span className="badge badge--neutral">{t('central.programHealth.status.updated', 'UPDATED: JUST NOW')}</span>
        </div>
      </div>

      <InfoBanner 
        title={t('central.programHealth.banner.title', 'DISTRICT OPERATIONS & DRIFT')}
        text={t('central.programHealth.banner.text', "Review high-level screening throughput and turnaround times. The Model Drift Indicator tracks the continuous learning pipeline's stability. The Simulink Engine actively forecasts bottlenecks and recommends load-balancing measures.")}
      />

      {/* Top Stats Row */}
      <div className="grid--4 u-mb-6" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--sp-4)' }}>
        <StatCard 
          title={t('central.programHealth.stats.screenedToday.title', 'SCREENED TODAY')}
          value="412" 
          subtext={t('central.programHealth.stats.screenedToday.subtext', 'TARGET: 500')}
          trend={12} 
        />
        <StatCard 
          title={t('central.programHealth.stats.screenedWeek.title', 'SCREENED THIS WEEK')}
          value="2,845" 
          subtext={t('central.programHealth.stats.screenedWeek.subtext', 'ACROSS 14 SITES')}
          trend={5} 
        />
        <StatCard 
          title={t('central.programHealth.stats.referralRate.title', 'REFERRAL RATE')}
          value="18.4%" 
          subtext={t('central.programHealth.stats.referralRate.subtext', 'AVERAGE: 18%')}
          trend={-0.4} 
        />
        <StatCard 
          title={t('central.programHealth.stats.avgTurnaround.title', 'AVG TURNAROUND')}
          value="2.4H" 
          subtext={t('central.programHealth.stats.avgTurnaround.subtext', 'TARGET: <4H')}
          isWarning={false} 
        />
      </div>

      <div className="grid--2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-6)' }}>
        
        {/* Model Drift Indicator */}
        <div className="panel u-p-6" style={{ border: '1px solid var(--border)' }}>
          <div className="u-flex u-justify-between u-items-center u-mb-4">
            <h2 className="t-h3">{t('central.programHealth.drift.title', 'MODEL DRIFT INDICATOR')}</h2>
            <span className="badge badge--warning">{t('central.programHealth.drift.status', 'MONITORING')}</span>
          </div>
          <p className="t-mono u-mb-6" style={{ opacity: 0.8, fontSize: 'var(--fs-small)' }}>
            {t('central.programHealth.drift.desc', 'AI-VS-OVERRIDE AGREEMENT RATE TREND (LAST 30 DAYS)')}
          </p>
          
          <div style={{ height: '200px', display: 'flex', alignItems: 'flex-end', gap: '4px', borderBottom: '1px solid var(--border)' }}>
            {/* Mock Chart Bars */}
            {[...Array(30)].map((_, i) => {
              const agreementRate = 95 - Math.random() * 5 - (i > 20 ? i * 0.2 : 0); // Slight artificial drift
              const isLow = agreementRate < 90;
              return (
                <div 
                  key={i} 
                  style={{ 
                    flex: 1, 
                    height: `${agreementRate}%`, 
                    backgroundColor: isLow ? 'var(--c-warning)' : 'var(--c-crimson)',
                    opacity: 0.8
                  }} 
                  title={`Day ${i+1}: ${agreementRate.toFixed(1)}% Agreement`}
                />
              );
            })}
          </div>
          <div className="u-flex u-justify-between u-mt-2 t-mono" style={{ fontSize: 'var(--fs-tiny)', opacity: 0.5 }}>
            <span>{t('central.programHealth.drift.ago', '30 DAYS AGO')}</span>
            <span>{t('central.programHealth.drift.current', 'CURRENT (91.2%)')}</span>
          </div>
        </div>

        {/* Simulink Resource Allocation Placeholder */}
        <div className="panel u-p-6" style={{ border: '1px solid var(--border)', background: 'rgba(0,0,0,0.02)' }}>
          <div className="u-flex u-justify-between u-items-center u-mb-4">
            <h2 className="t-h3">{t('central.programHealth.simulink.title', 'RESOURCE ALLOCATION MODEL')}</h2>
            <span className="badge badge--tier-c">{t('central.programHealth.simulink.badge', 'SIMULINK ENGINE')}</span>
          </div>
          <p className="t-mono u-mb-6" style={{ opacity: 0.8, fontSize: 'var(--fs-small)' }}>
            {t('central.programHealth.simulink.desc', 'DISCRETE-EVENT SIMULATION OUTPUT (QUEUE CAPACITIES)')}
          </p>
          
          <div className="u-flex u-flex-col u-gap-4">
            <div style={{ padding: 'var(--sp-4)', border: '1px dashed var(--c-crimson)' }}>
              <div className="t-mono u-mb-2" style={{ fontWeight: 700 }}>{t('central.programHealth.simulink.bottleneckTitle', '▶ BOTTLENECK DETECTED: PUNE NORTH SECTOR')}</div>
              <p className="t-mono" style={{ fontSize: 'var(--fs-small)', opacity: 0.7 }}>
                {t('central.programHealth.simulink.bottleneckText', 'Current arrival rate (45/hr) exceeds local grading capacity. Tier-C queue length projected to exceed 48h limit by tomorrow.')} 
              </p>
            </div>
            
            <div style={{ padding: 'var(--sp-4)', border: '1px solid var(--border)', background: 'var(--bg)' }}>
              <div className="t-mono u-mb-2" style={{ fontWeight: 700 }}>{t('central.programHealth.simulink.recTitle', '▶ RECOMMENDATION')}</div>
              <p className="t-mono" style={{ fontSize: 'var(--fs-small)', opacity: 0.7 }}>
                {t('central.programHealth.simulink.recText', 'Re-route 30% of incoming Tier-B cases from Pune North to Central Pool for the next 12 hours. Maintain Tier-C local priority.')}
              </p>
              <button className="btn btn--outline u-mt-4" style={{ padding: '8px 16px', fontSize: 'var(--fs-tiny)' }}>
                {t('central.programHealth.simulink.applyBtn', 'APPLY LOAD BALANCING')}
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
