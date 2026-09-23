import React, { useEffect, useRef } from 'react';

export const RetinalWaveCanvas = () => {
  const svgRef = useRef(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    // Parallax: shift vessel paths on mouse move for depth
    const handleMouseMove = (e) => {
      const { clientX, clientY } = e;
      const xOffset = (clientX / window.innerWidth - 0.5) * 24;
      const yOffset = (clientY / window.innerHeight - 0.5) * 24;

      const paths = svg.querySelectorAll('path');
      paths.forEach((path, i) => {
        const factor = (i % 4) + 1;
        const speed = 0.3 + (factor * 0.15);
        path.style.transform = `translate(${xOffset * speed}px, ${yOffset * speed}px)`;
        path.style.transition = 'transform 0.6s cubic-bezier(0.23, 1, 0.32, 1)';
      });

      // Shift glow circles
      const circles = svg.querySelectorAll('.glow-pulse');
      circles.forEach((circle, i) => {
        const factor = (i % 3) + 1;
        circle.style.transform = `translate(${xOffset * 0.2 * factor}px, ${yOffset * 0.2 * factor}px)`;
        circle.style.transition = 'transform 0.8s cubic-bezier(0.23, 1, 0.32, 1)';
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div className="wave-canvas">
      <svg ref={svgRef} viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="retina-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--c-crimson)" stopOpacity="0.15" />
            <stop offset="60%" stopColor="var(--c-crimson)" stopOpacity="0.05" />
            <stop offset="100%" stopColor="var(--c-crimson)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="vessel-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--c-crimson)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--c-crimson)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Background glow */}
        <circle cx="500" cy="500" r="420" fill="url(#retina-glow)">
          <animate attributeName="r" values="400;420;400" dur="6s" repeatCount="indefinite" />
        </circle>

        {/* Primary retinal vessels — with stroke-dasharray drawing animation */}
        <path d="M100,500 Q300,300 500,500 T900,500" strokeDasharray="1200" strokeDashoffset="1200" style={{ animation: 'vessel-draw 3s ease-out 0.2s forwards' }} />
        <path d="M150,400 Q350,600 550,400 T950,400" strokeDasharray="1200" strokeDashoffset="1200" style={{ animation: 'vessel-draw 3s ease-out 0.5s forwards' }} />
        <path d="M50,600 Q250,400 450,600 T850,600" strokeDasharray="1200" strokeDashoffset="1200" style={{ animation: 'vessel-draw 3s ease-out 0.8s forwards' }} />

        {/* Diagonal arteries */}
        <path d="M200,200 Q400,400 500,500 Q600,600 800,800" strokeWidth="1.5" strokeDasharray="1000" strokeDashoffset="1000" style={{ animation: 'vessel-draw 2.5s ease-out 1s forwards' }} />
        <path d="M300,100 Q450,450 500,500 Q550,550 700,900" strokeWidth="1.5" strokeDasharray="1000" strokeDashoffset="1000" style={{ animation: 'vessel-draw 2.5s ease-out 1.2s forwards' }} />
        <path d="M100,800 Q300,600 500,500 Q700,400 900,200" strokeWidth="1.5" strokeDasharray="1000" strokeDashoffset="1000" style={{ animation: 'vessel-draw 2.5s ease-out 1.4s forwards' }} />

        {/* Secondary branches — thinner, more delicate */}
        <path d="M350,250 Q420,350 500,400" strokeWidth="0.5" opacity="0.25" strokeDasharray="400" strokeDashoffset="400" style={{ animation: 'vessel-draw 2s ease-out 1.8s forwards' }} />
        <path d="M650,250 Q580,350 500,400" strokeWidth="0.5" opacity="0.25" strokeDasharray="400" strokeDashoffset="400" style={{ animation: 'vessel-draw 2s ease-out 2s forwards' }} />
        <path d="M350,750 Q420,650 500,600" strokeWidth="0.5" opacity="0.25" strokeDasharray="400" strokeDashoffset="400" style={{ animation: 'vessel-draw 2s ease-out 2.2s forwards' }} />
        <path d="M650,750 Q580,650 500,600" strokeWidth="0.5" opacity="0.25" strokeDasharray="400" strokeDashoffset="400" style={{ animation: 'vessel-draw 2s ease-out 2.4s forwards' }} />

        {/* Optic disc */}
        <circle cx="300" cy="450" r="40" fill="none" stroke="var(--c-black)" opacity="0.4" strokeDasharray="4 4">
          <animate attributeName="opacity" values="0.3;0.5;0.3" dur="4s" repeatCount="indefinite" />
        </circle>

        {/* Macula */}
        <circle cx="650" cy="500" r="20" fill="none" stroke="var(--c-black)" opacity="0.25">
          <animate attributeName="r" values="18;22;18" dur="5s" repeatCount="indefinite" />
        </circle>

        {/* Pulsing glow at vessel intersections */}
        <circle className="glow-pulse" cx="500" cy="500" r="6" fill="var(--c-crimson)" opacity="0.15">
          <animate attributeName="r" values="4;8;4" dur="3s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.1;0.25;0.1" dur="3s" repeatCount="indefinite" />
        </circle>
        <circle className="glow-pulse" cx="400" cy="400" r="4" fill="var(--c-crimson)" opacity="0.1">
          <animate attributeName="r" values="3;6;3" dur="4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.05;0.15;0.05" dur="4s" repeatCount="indefinite" />
        </circle>
        <circle className="glow-pulse" cx="600" cy="600" r="4" fill="var(--c-crimson)" opacity="0.1">
          <animate attributeName="r" values="3;6;3" dur="3.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.05;0.15;0.05" dur="3.5s" repeatCount="indefinite" />
        </circle>

        <style>{`
          @keyframes vessel-draw {
            to { stroke-dashoffset: 0; }
          }
        `}</style>
      </svg>
    </div>
  );
};
