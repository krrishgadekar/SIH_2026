import React, { useEffect, useRef } from 'react';

export const RetinalWaveCanvas = () => {
  const svgRef = useRef(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    // Simple interaction: slightly shift paths on mouse move to simulate looking around the retina
    const handleMouseMove = (e) => {
      const { clientX, clientY } = e;
      const xOffset = (clientX / window.innerWidth - 0.5) * 20;
      const yOffset = (clientY / window.innerHeight - 0.5) * 20;

      const paths = svg.querySelectorAll('path');
      paths.forEach((path, i) => {
        const factor = (i % 3) + 1;
        path.style.transform = `translate(${xOffset * factor}px, ${yOffset * factor}px)`;
        path.style.transition = 'transform 0.5s ease-out';
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
            <stop offset="0%" stopColor="var(--c-crimson)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--c-crimson)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="500" cy="500" r="400" fill="url(#retina-glow)" />
        {/* Simulated retinal vessels/topography */}
        <path d="M100,500 Q300,300 500,500 T900,500" />
        <path d="M150,400 Q350,600 550,400 T950,400" />
        <path d="M50,600 Q250,400 450,600 T850,600" />
        
        <path d="M200,200 Q400,400 500,500 Q600,600 800,800" strokeWidth="1.5" />
        <path d="M300,100 Q450,450 500,500 Q550,550 700,900" strokeWidth="1.5" />
        <path d="M100,800 Q300,600 500,500 Q700,400 900,200" strokeWidth="1.5" />
        
        {/* Optic disc representation */}
        <circle cx="300" cy="450" r="40" fill="none" stroke="var(--c-black)" opacity="0.5" strokeDasharray="4 4" />
        
        {/* Macula representation */}
        <circle cx="650" cy="500" r="20" fill="none" stroke="var(--c-black)" opacity="0.3" />
      </svg>
    </div>
  );
};
