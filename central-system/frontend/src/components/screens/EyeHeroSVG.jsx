import React, { useMemo } from 'react';

/**
 * EyeHeroSVG — A layered SVG eye illustration that transforms based on scroll progress.
 * 
 * Props:
 *   progress: 0–1 overall scroll progress
 *   chapter: current chapter index (0–5)
 *   chapterProgress: 0–1 progress within the current chapter
 *   pointerX/Y: -1 to 1 normalised pointer position for gaze tracking
 */
export const EyeHeroSVG = ({ progress = 0, chapter = 0, chapterProgress = 0, pointerX = 0, pointerY = 0 }) => {
  // Derived animation values
  const gazeX = chapter === 0 ? pointerX * 6 : 0;
  const gazeY = chapter === 0 ? pointerY * 4 : 0;

  // Pupil size: contracts as we zoom in (chapters 2-3)
  const pupilR = chapter >= 2 ? lerp(28, 18, Math.min(chapterProgress, 1)) : 28;

  // Iris zoom: scale up as we go deeper
  const irisScale = chapter >= 2 ? lerp(1, 1.8, Math.min((progress - 0.3) / 0.3, 1)) : 1;

  // Overall eye rotation (slight 3D tilt in chapter 1-2)
  const rotateY = chapter === 1 ? lerp(0, -12, chapterProgress) :
                  chapter === 2 ? lerp(-12, 0, chapterProgress) : 0;
  const rotateX = chapter === 1 ? lerp(0, 5, chapterProgress) :
                  chapter === 2 ? lerp(5, 0, chapterProgress) : 0;

  // Explode offset for chapter 3 (PHC segments)
  const explode = chapter === 3 ? chapterProgress : 0;

  // Retina overlay opacity (deep chapters)
  const retinaOpacity = chapter >= 4 ? Math.min(chapterProgress * 2, 1) : 
                         chapter === 3 ? lerp(0, 0.3, chapterProgress) : 0;

  // Overall scale — zoom in progressively
  const scale = chapter === 0 ? 1 :
                chapter === 1 ? lerp(1, 1.15, chapterProgress) :
                chapter === 2 ? lerp(1.15, 2.2, chapterProgress) :
                chapter === 3 ? lerp(2.2, 1.6, chapterProgress) :
                chapter === 4 ? lerp(1.6, 3.5, chapterProgress) :
                lerp(3.5, 0.6, chapterProgress);

  // Opacity — fade out in last chapter
  const opacity = chapter === 5 ? lerp(1, 0.15, chapterProgress) : 1;

  // Translate — shift the eye as we zoom
  const translateY = chapter >= 2 ? lerp(0, -40, Math.min((progress - 0.25) / 0.5, 1)) : 0;

  // Leader lines visibility
  const showLeaders = chapter === 1 || chapter === 3;

  // Iris segment colours for PHC chapters
  const phcSegments = useMemo(() => [
    { angle: 0, color: '#C42B2B', label: 'Kharadi' },
    { angle: 72, color: '#D94444', label: 'Wagholi' },
    { angle: 144, color: '#9B1B1B', label: 'Hadapsar' },
    { angle: 216, color: '#6E1414', label: 'Lohegaon' },
    { angle: 288, color: '#E86868', label: 'Viman Nagar' },
  ], []);

  return (
    <div
      className="eye-hero-svg"
      style={{
        transform: `perspective(1200px) rotateY(${rotateY}deg) rotateX(${rotateX}deg) scale(${scale}) translateY(${translateY}px)`,
        opacity,
        transition: 'opacity 0.6s ease',
      }}
    >
      <svg
        viewBox="0 0 500 260"
        xmlns="http://www.w3.org/2000/svg"
        className="eye-hero-svg__canvas"
        aria-label="Diagnostic eye illustration"
      >
        <defs>
          {/* Iris radial gradient */}
          <radialGradient id="iris-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1a0503" />
            <stop offset="25%" stopColor="#3a1a0a" />
            <stop offset="50%" stopColor="#8B4513" />
            <stop offset="75%" stopColor="#A0522D" />
            <stop offset="95%" stopColor="#6B3410" />
            <stop offset="100%" stopColor="#4a2008" />
          </radialGradient>

          {/* Sclera gradient */}
          <radialGradient id="sclera-grad" cx="50%" cy="48%" r="55%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="70%" stopColor="#f0ebe4" />
            <stop offset="100%" stopColor="#d8cfc0" />
          </radialGradient>

          {/* Retina scan overlay */}
          <radialGradient id="retina-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff6b35" stopOpacity="0.6" />
            <stop offset="30%" stopColor="#c42b2b" stopOpacity="0.4" />
            <stop offset="60%" stopColor="#6e1414" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#1a0503" stopOpacity="0" />
          </radialGradient>

          {/* Glow filter */}
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Shadow filter */}
          <filter id="eye-shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="#1a0503" floodOpacity="0.5" />
          </filter>

          {/* Eye clipping path */}
          <clipPath id="eye-clip">
            <ellipse cx="250" cy="130" rx="185" ry="88" />
          </clipPath>
        </defs>

        {/* === SCLERA (white of the eye) === */}
        <g filter="url(#eye-shadow)">
          {/* Upper lid curve */}
          <path
            d="M 65 130 Q 150 30, 250 28 Q 350 30, 435 130"
            fill="none"
            stroke="#3a2a1a"
            strokeWidth="2.5"
            opacity="0.6"
          />
          {/* Lower lid curve */}
          <path
            d="M 65 130 Q 150 225, 250 228 Q 350 225, 435 130"
            fill="none"
            stroke="#3a2a1a"
            strokeWidth="2"
            opacity="0.4"
          />
          
          {/* Sclera fill */}
          <ellipse
            cx="250"
            cy="130"
            rx="185"
            ry="95"
            fill="url(#sclera-grad)"
            clipPath="url(#eye-clip)"
          />
        </g>

        {/* === IRIS === */}
        <g
          transform={`translate(${250 + gazeX}, ${130 + gazeY})`}
          style={{
            transform: `translate(${250 + gazeX}px, ${130 + gazeY}px) scale(${irisScale})`,
            transformOrigin: 'center',
            transition: 'transform 0.15s ease-out',
          }}
        >
          {/* Iris base */}
          <circle
            cx="0" cy="0" r="58"
            fill="url(#iris-grad)"
            stroke="#2a1508"
            strokeWidth="2"
          />

          {/* Iris texture — radial lines */}
          {Array.from({ length: 36 }, (_, i) => {
            const angle = (i * 10) * Math.PI / 180;
            const inner = 22;
            const outer = 55;
            return (
              <line
                key={`iris-line-${i}`}
                x1={Math.cos(angle) * inner}
                y1={Math.sin(angle) * inner}
                x2={Math.cos(angle) * outer}
                y2={Math.sin(angle) * outer}
                stroke="#8B4513"
                strokeWidth={i % 3 === 0 ? 1.5 : 0.5}
                opacity={0.3 + (i % 3 === 0 ? 0.2 : 0)}
              />
            );
          })}

          {/* Iris ring highlight */}
          <circle cx="0" cy="0" r="56" fill="none" stroke="#A0522D" strokeWidth="1" opacity="0.3" />
          <circle cx="0" cy="0" r="50" fill="none" stroke="#6B3410" strokeWidth="0.5" opacity="0.4" />

          {/* PHC Segments — visible in chapter 3 (explode) */}
          {explode > 0 && phcSegments.map((seg, i) => {
            const a = (seg.angle - 90) * Math.PI / 180;
            const explodeR = explode * 18;
            return (
              <g
                key={`phc-seg-${i}`}
                transform={`translate(${Math.cos(a) * explodeR}, ${Math.sin(a) * explodeR})`}
                opacity={0.3 + explode * 0.7}
              >
                <path
                  d={describeArc(0, 0, 42, seg.angle, seg.angle + 68)}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth="10"
                  strokeLinecap="round"
                  opacity="0.8"
                  filter="url(#glow)"
                />
              </g>
            );
          })}

          {/* === PUPIL === */}
          <circle
            cx="0" cy="0"
            r={pupilR}
            fill="#0a0402"
          />

          {/* Pupil highlight (reflection) */}
          <circle cx="-10" cy="-12" r="6" fill="#ffffff" opacity="0.85" />
          <circle cx="8" cy="-6" r="2.5" fill="#ffffff" opacity="0.4" />

          {/* === RETINA SCAN OVERLAY === */}
          <g opacity={retinaOpacity}>
            <circle cx="0" cy="0" r="52" fill="url(#retina-grad)" />
            {/* Optic disc */}
            <circle cx="14" cy="2" r="8" fill="#ffcba4" opacity="0.5" stroke="#c42b2b" strokeWidth="0.5" />
            {/* Blood vessel pattern */}
            {[
              'M 14 2 Q 30 -10, 48 -20',
              'M 14 2 Q 35 5, 50 10',
              'M 14 2 Q 25 15, 45 25',
              'M 14 2 Q 0 -15, -30 -25',
              'M 14 2 Q -5 10, -35 20',
              'M 14 2 Q -10 -5, -40 -8',
            ].map((d, i) => (
              <path
                key={`vessel-${i}`}
                d={d}
                fill="none"
                stroke="#c42b2b"
                strokeWidth={1.2 - i * 0.1}
                opacity={0.4 + i * 0.05}
                strokeLinecap="round"
              />
            ))}
          </g>
        </g>

        {/* === LEADER LINES (Chapters 1 & 3) === */}
        {showLeaders && (
          <g className="eye-leaders" opacity={chapterProgress > 0.2 ? 1 : 0} style={{ transition: 'opacity 0.5s' }}>
            {chapter === 1 && (
              <>
                {/* Cornea callout */}
                <line x1="120" y1="80" x2="60" y2="40" stroke="#C42B2B" strokeWidth="1" opacity="0.5" />
                <circle cx="60" cy="40" r="3" fill="#C42B2B" />
                
                {/* Iris callout */}
                <line x1="200" y1="130" x2="60" y2="160" stroke="#C42B2B" strokeWidth="1" opacity="0.5" />
                <circle cx="60" cy="160" r="3" fill="#C42B2B" />
                
                {/* Pupil callout */}
                <line x1="250" y1="130" x2="440" y2="60" stroke="#C42B2B" strokeWidth="1" opacity="0.5" />
                <circle cx="440" cy="60" r="3" fill="#C42B2B" />
              </>
            )}
          </g>
        )}

        {/* === DECORATIVE MEASUREMENT LINES === */}
        <g opacity={chapter <= 1 ? 0.15 : 0} style={{ transition: 'opacity 0.8s' }}>
          {/* Horizontal measure */}
          <line x1="65" y1="240" x2="435" y2="240" stroke="#C42B2B" strokeWidth="0.5" strokeDasharray="4 4" />
          <line x1="65" y1="236" x2="65" y2="244" stroke="#C42B2B" strokeWidth="0.5" />
          <line x1="435" y1="236" x2="435" y2="244" stroke="#C42B2B" strokeWidth="0.5" />
          <text x="250" y="254" textAnchor="middle" fill="#C42B2B" fontSize="8" fontFamily="'JetBrains Mono', monospace" letterSpacing="0.1em">
            24.2 mm AXIAL LENGTH
          </text>
        </g>
      </svg>

      {/* Crimson scanning line animation */}
      {chapter >= 2 && chapter <= 4 && (
        <div className="eye-hero-svg__scanline" style={{ opacity: Math.min(chapterProgress * 2, 0.4) }} />
      )}
    </div>
  );
};

// --- Utility functions ---

function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
