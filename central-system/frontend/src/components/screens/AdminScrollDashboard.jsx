import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { centralApi } from '../../api/centralApiClient';
import { EyeHeroSVG } from './EyeHeroSVG';
import './AdminScrollDashboard.css';

const CHAPTERS = [
  { id: 'hero', label: 'Overview', num: '01' },
  { id: 'screening', label: 'Screening', num: '02' },
  { id: 'ai', label: 'AI Performance', num: '03' },
  { id: 'phc', label: 'PHC Network', num: '04' },
  { id: 'referral', label: 'Referrals', num: '05' },
  { id: 'enter', label: 'Dashboard', num: '06' },
];

// --- Animated counter hook ---
const useCountUp = (target, shouldAnimate, duration = 1400) => {
  const [display, setDisplay] = useState('0');
  const rafRef = useRef(null);

  useEffect(() => {
    if (!shouldAnimate) { setDisplay('0'); return; }
    const cleanStr = String(target).replace(/,/g, '');
    const numericTarget = parseFloat(cleanStr);
    if (isNaN(numericTarget)) { setDisplay(String(target)); return; }

    const isFloat = cleanStr.includes('.');
    const decimals = isFloat ? (cleanStr.split('.')[1] || '').length : 0;
    const startTime = performance.now();

    const animate = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = numericTarget * eased;
      setDisplay(isFloat ? current.toFixed(decimals) : Math.round(current).toLocaleString());
      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, shouldAnimate, duration]);

  return display;
};

// --- Stat card with counter ---
const StatCard = ({ label, value, suffix, delta, deltaDir, visible }) => {
  const animVal = useCountUp(value, visible);
  return (
    <div className={`admin-scroll__stat ${visible ? 'admin-scroll__stat--visible' : ''}`}>
      <div className="admin-scroll__stat-label">{label}</div>
      <div className="admin-scroll__stat-value">
        {animVal}{suffix && <span className="suffix">{suffix}</span>}
      </div>
      {delta && (
        <div className={`admin-scroll__stat-delta admin-scroll__stat-delta--${deltaDir || 'up'}`}>
          {delta}
        </div>
      )}
    </div>
  );
};

// --- Progress ring ---
const ProgressRing = ({ value, visible, label }) => {
  const r = 36;
  const circumference = 2 * Math.PI * r;
  const offset = visible ? circumference * (1 - value / 100) : circumference;
  const animVal = useCountUp(value.toFixed(1), visible, 1600);

  return (
    <div className="admin-scroll__stat" style={{ display: 'flex', alignItems: 'center', gap: '16px', opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateX(-20px)', transition: 'all 0.6s ease' }}>
      <div className="admin-scroll__ring">
        <svg viewBox="0 0 80 80">
          <circle className="admin-scroll__ring-bg" cx="40" cy="40" r={r} />
          <circle
            className="admin-scroll__ring-fill"
            cx="40" cy="40" r={r}
            style={{
              '--ring-circumference': circumference,
              '--ring-offset': offset,
              strokeDasharray: circumference,
              strokeDashoffset: offset,
            }}
          />
        </svg>
        <div className="admin-scroll__ring-value">{animVal}%</div>
      </div>
      <div>
        <div className="admin-scroll__stat-label">{label}</div>
      </div>
    </div>
  );
};

// ===== MAIN COMPONENT =====
export const AdminScrollDashboard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  // Scroll state
  const containerRef = useRef(null);
  const chapterRefs = useRef([]);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [activeChapter, setActiveChapter] = useState(0);
  const [chapterProgress, setChapterProgress] = useState(0);
  const [visibleChapters, setVisibleChapters] = useState(new Set([0]));

  // Pointer for gaze tracking
  const [pointer, setPointer] = useState({ x: 0, y: 0 });

  // Load data
  useEffect(() => {
    centralApi.getAdminDashboard().then(d => setData(d)).catch(() => {});
  }, []);

  // Scroll handler
  useEffect(() => {
    const onScroll = () => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const totalHeight = container.scrollHeight - window.innerHeight;
      const scrolled = -rect.top;
      const progress = Math.max(0, Math.min(1, scrolled / totalHeight));
      setScrollProgress(progress);

      // Determine active chapter
      const chapterCount = CHAPTERS.length;
      const chapterIdx = Math.min(Math.floor(progress * chapterCount), chapterCount - 1);
      const chProgress = (progress * chapterCount) - chapterIdx;
      setActiveChapter(chapterIdx);
      setChapterProgress(chProgress);

      // Track visible chapters (for triggering animations)
      const newVisible = new Set();
      chapterRefs.current.forEach((el, i) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight * 0.85 && r.bottom > 0) {
          newVisible.add(i);
        }
      });
      setVisibleChapters(newVisible);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Pointer tracking
  useEffect(() => {
    const onMove = (e) => {
      setPointer({
        x: (e.clientX / window.innerWidth) * 2 - 1,
        y: (e.clientY / window.innerHeight) * 2 - 1,
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  const scrollToChapter = useCallback((idx) => {
    const container = containerRef.current;
    if (!container) return;
    const totalHeight = container.scrollHeight - window.innerHeight;
    const targetScroll = container.offsetTop + (idx / CHAPTERS.length) * totalHeight;
    window.scrollTo({ top: targetScroll, behavior: 'smooth' });
  }, []);

  const today = useMemo(() => {
    return new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }, []);

  // Mock data fallbacks
  const stats = useMemo(() => ({
    casesToday: data?.stats?.casesToday ?? 42,
    thisWeek: data?.stats?.thisWeek ?? 187,
    totalProcessed: data?.stats?.totalProcessed ?? '1,284',
    avgReviewTime: data?.stats?.avgReviewTime ?? '27',
    modelAccuracy: data?.stats?.modelAccuracy ?? 94.6,
    overrideRate: data?.stats?.overrideRate ?? 8.3,
    avgConfidence: data?.stats?.avgConfidence ?? 92.4,
    imagesRejected: data?.stats?.imagesRejected ?? 38,
  }), [data]);

  const phcs = useMemo(() => data?.casesPerPhc ?? [
    { phcName: 'PHC Kharadi', count: 12 },
    { phcName: 'PHC Wagholi', count: 9 },
    { phcName: 'PHC Hadapsar', count: 15 },
    { phcName: 'PHC Lohegaon', count: 6 },
  ], [data]);

  const maxPhcCount = useMemo(() => Math.max(...phcs.map(p => p.count), 1), [phcs]);

  return (
    <div className="admin-scroll" ref={containerRef}>
      {/* Corner decorations */}
      <div className="admin-scroll__corner admin-scroll__corner--tl" />
      <div className="admin-scroll__corner admin-scroll__corner--tr" />
      <div className="admin-scroll__corner admin-scroll__corner--bl" />
      <div className="admin-scroll__corner admin-scroll__corner--br" />

      {/* HUD */}
      <div className="admin-scroll__hud">
        SYS::DISTRICT_ADMIN<br />
        DR✦AI // OVERVIEW<br />
        SCROLL_PROGRESS: {(scrollProgress * 100).toFixed(0)}%
      </div>

      {/* Chapter navigation dots */}
      <nav className="admin-scroll__nav" aria-label="Chapter navigation">
        {CHAPTERS.map((ch, i) => (
          <button
            key={ch.id}
            className={`admin-scroll__nav-dot ${activeChapter === i ? 'admin-scroll__nav-dot--active' : ''}`}
            onClick={() => scrollToChapter(i)}
            aria-label={`Go to ${ch.label}`}
          >
            <span className="admin-scroll__nav-label">{ch.label}</span>
            <span className="admin-scroll__nav-num">{ch.num}</span>
            <span className="admin-scroll__nav-pip" />
          </button>
        ))}
      </nav>

      {/* ═══ STICKY VIEWPORT (pinned eye scene) ═══ */}
      <div className="admin-scroll__viewport">
        <EyeHeroSVG
          progress={scrollProgress}
          chapter={activeChapter}
          chapterProgress={chapterProgress}
          pointerX={pointer.x}
          pointerY={pointer.y}
        />
      </div>

      {/* ═══ SCROLL TRACK (chapters that overlay the sticky viewport) ═══ */}
      <div className="admin-scroll__track">

        {/* ── Chapter 01: HERO ── */}
        <section
          className="admin-scroll__chapter"
          ref={el => chapterRefs.current[0] = el}
        >
          <div className={`admin-scroll__panel admin-scroll__panel--left ${visibleChapters.has(0) ? 'admin-scroll__panel--visible' : ''}`}>
            <div className="admin-scroll__chapter-num">01</div>
            <h1 className="admin-scroll__hero-title">
              DISTRICT<br /><span className="accent">OVER</span>VIEW
            </h1>
            <p className="admin-scroll__hero-date">{today}</p>
            <p className="admin-scroll__subtitle" style={{ marginTop: '1.5rem' }}>
              A comprehensive look at the DR screening program across all Primary Health Centres in your district.
            </p>
          </div>
          <div className="admin-scroll__watermark admin-scroll__watermark--right">EYE</div>
        </section>

        {/* ── Chapter 02: SCREENING IMPACT ── */}
        <section
          className="admin-scroll__chapter"
          ref={el => chapterRefs.current[1] = el}
        >
          <div className={`admin-scroll__panel admin-scroll__panel--left ${visibleChapters.has(1) ? 'admin-scroll__panel--visible' : ''}`}>
            <div className="admin-scroll__chapter-num">02 — SCREENING IMPACT</div>
            <h2 className="admin-scroll__title">Cases<br />Processed</h2>
            <p className="admin-scroll__subtitle">
              Real-time screening throughput across all connected PHCs.
            </p>
            <div className="admin-scroll__stats admin-scroll__stats--col">
              <StatCard label="CASES TODAY" value={stats.casesToday} delta="+12% from yesterday" deltaDir="up" visible={visibleChapters.has(1)} />
              <StatCard label="THIS WEEK" value={stats.thisWeek} delta="+8% WoW" deltaDir="up" visible={visibleChapters.has(1)} />
              <StatCard label="TOTAL PROCESSED" value={stats.totalProcessed} visible={visibleChapters.has(1)} />
              <StatCard label="AVG REVIEW TIME" value={stats.avgReviewTime} suffix="s" delta="-3s from last week" deltaDir="up" visible={visibleChapters.has(1)} />
            </div>
          </div>
          <div className="admin-scroll__watermark admin-scroll__watermark--right">42</div>
        </section>

        {/* ── Chapter 03: AI PERFORMANCE ── */}
        <section
          className="admin-scroll__chapter"
          ref={el => chapterRefs.current[2] = el}
        >
          <div className={`admin-scroll__panel admin-scroll__panel--right ${visibleChapters.has(2) ? 'admin-scroll__panel--visible' : ''}`}>
            <div className="admin-scroll__chapter-num">03 — AI PERFORMANCE</div>
            <h2 className="admin-scroll__title">Model<br />Accuracy</h2>
            <p className="admin-scroll__subtitle">
              Deep learning model diagnostics and confidence metrics for the CNN grading engine.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <ProgressRing value={stats.modelAccuracy} visible={visibleChapters.has(2)} label="MODEL ACCURACY" />
              <ProgressRing value={100 - stats.overrideRate} visible={visibleChapters.has(2)} label="AGREEMENT RATE" />
              <ProgressRing value={stats.avgConfidence} visible={visibleChapters.has(2)} label="AVG CONFIDENCE" />
            </div>
          </div>
          <div className="admin-scroll__watermark admin-scroll__watermark--left">94.6</div>
        </section>

        {/* ── Chapter 04: PHC NETWORK ── */}
        <section
          className="admin-scroll__chapter"
          ref={el => chapterRefs.current[3] = el}
        >
          <div className={`admin-scroll__panel admin-scroll__panel--left ${visibleChapters.has(3) ? 'admin-scroll__panel--visible' : ''}`}>
            <div className="admin-scroll__chapter-num">04 — PHC NETWORK</div>
            <h2 className="admin-scroll__title">Health<br />Centres</h2>
            <p className="admin-scroll__subtitle">
              Per-centre case distribution and screening workload.
            </p>
            <div className="admin-scroll__phc-grid">
              {phcs.map((phc, i) => (
                <div
                  key={phc.phcName}
                  className={`admin-scroll__phc ${visibleChapters.has(3) ? 'admin-scroll__phc--visible' : ''}`}
                  style={{ transitionDelay: `${i * 0.12}s` }}
                >
                  <div className="admin-scroll__phc-name">{phc.phcName.replace('PHC ', '')}</div>
                  <div className="admin-scroll__phc-count">{phc.count}</div>
                  <div className="admin-scroll__phc-bar">
                    <div
                      className="admin-scroll__phc-bar-fill"
                      style={{ '--bar-width': `${(phc.count / maxPhcCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Chapter 05: REFERRAL PIPELINE ── */}
        <section
          className="admin-scroll__chapter"
          ref={el => chapterRefs.current[4] = el}
        >
          <div className={`admin-scroll__panel admin-scroll__panel--right ${visibleChapters.has(4) ? 'admin-scroll__panel--visible' : ''}`}>
            <div className="admin-scroll__chapter-num">05 — REFERRAL PIPELINE</div>
            <h2 className="admin-scroll__title">Referral<br />Funnel</h2>
            <p className="admin-scroll__subtitle">
              Patient journey from AI screening to specialist confirmation and treatment.
            </p>
            <div className="admin-scroll__funnel">
              {[
                { label: 'SCREENED', value: 1284, width: '100%' },
                { label: 'REFERRED', value: 312, width: '24%' },
                { label: 'CONFIRMED', value: 287, width: '22%' },
                { label: 'TREATED', value: 198, width: '15%' },
              ].map((step, i) => (
                <div
                  key={step.label}
                  className={`admin-scroll__funnel-step ${visibleChapters.has(4) ? 'admin-scroll__funnel-step--visible' : ''}`}
                  style={{ transitionDelay: `${i * 0.15}s` }}
                >
                  <div className="admin-scroll__funnel-label">{step.label}</div>
                  <div className="admin-scroll__funnel-bar" style={{ '--funnel-width': step.width }}>
                    <span className="admin-scroll__funnel-bar-val">{step.value.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="admin-scroll__watermark admin-scroll__watermark--left">DR</div>
        </section>

        {/* ── Chapter 06: CTA ── */}
        <section
          className="admin-scroll__chapter"
          ref={el => chapterRefs.current[5] = el}
          style={{ justifyContent: 'center' }}
        >
          <div className={`admin-scroll__panel admin-scroll__panel--center ${visibleChapters.has(5) ? 'admin-scroll__panel--visible' : ''}`}>
            <div className="admin-scroll__chapter-num" style={{ justifyContent: 'center' }}>06 — ENTER</div>
            <h2 className="admin-scroll__title" style={{ textAlign: 'center' }}>
              Proceed to<br /><span style={{ color: 'var(--c-crimson)' }}>Full Dashboard</span>
            </h2>
            <p className="admin-scroll__subtitle" style={{ textAlign: 'center' }}>
              Access detailed charts, case tables, grade breakdowns, and PHC comparisons.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2rem' }}>
              <button
                className="admin-scroll__cta"
                onClick={() => navigate('/admin/dashboard/detailed')}
              >
                OPEN FULL DASHBOARD
                <span className="admin-scroll__cta-arrow">→</span>
              </button>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
};
