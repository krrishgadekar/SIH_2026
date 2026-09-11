import React, { useRef, useEffect, useState } from 'react';
import { CENTRAL_API_BASE } from '../../config';

/**
 * GradCamOverlay — real case: renders the actual fundus image with the real
 * Grad-CAM PNG (produced by branchAInfer.py) as an absolutely-positioned
 * semi-transparent layer on top, toggled by showOverlay. imageUrl/
 * gradCamOverlayUrl come back from the API as paths under /media (e.g.
 * "/media/cases/<id>/original.jpg"), served by the central backend itself —
 * not the frontend dev server — so they're resolved against CENTRAL_API_BASE.
 *
 * Mock/no-data case (imageUrl null, e.g. mock data or a case not yet graded):
 * falls back to the original procedurally-generated synthetic retina, so the
 * mock demo path is completely unchanged.
 */
const RealGradCam = ({ showOverlay, caseData, onLoadError }) => {
  const imageSrc = `${CENTRAL_API_BASE}${caseData.imageUrl}`;
  const overlaySrc = caseData.gradCamOverlayUrl ? `${CENTRAL_API_BASE}${caseData.gradCamOverlayUrl}` : null;

  return (
    <div className="gradcam-viewer">
      <img src={imageSrc} alt="Fundus capture" className="gradcam-viewer__fundus" onError={onLoadError} />
      {overlaySrc && (
        <img
          src={overlaySrc}
          alt="Grad-CAM attention overlay"
          className={`gradcam-viewer__overlay ${showOverlay ? 'gradcam-viewer__overlay--visible' : ''}`}
        />
      )}
      <div className="capture-zone__crosshair" />
      <div className="gradcam-viewer__brackets">
        <span className="gradcam-viewer__bracket gradcam-viewer__bracket--tl" />
        <span className="gradcam-viewer__bracket gradcam-viewer__bracket--tr" />
        <span className="gradcam-viewer__bracket gradcam-viewer__bracket--bl" />
        <span className="gradcam-viewer__bracket gradcam-viewer__bracket--br" />
      </div>
    </div>
  );
};

/**
 * SyntheticGradCam renders a synthetic fundus image and a Grad-CAM heatmap
 * overlay. Used when there is no real image to show (mock data, or a case
 * whose grading hasn't produced media yet).
 */
const SyntheticGradCam = ({ showOverlay, caseData }) => {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const [dimensions] = useState({ width: 500, height: 500 });

  // Draw synthetic fundus
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { width, height } = dimensions;
    canvas.width = width;
    canvas.height = height;

    // Background — dark retinal field
    const grad = ctx.createRadialGradient(width / 2, height / 2, 50, width / 2, height / 2, 280);
    grad.addColorStop(0, '#8B3A1A');
    grad.addColorStop(0.4, '#5C1A0A');
    grad.addColorStop(0.7, '#2A0A02');
    grad.addColorStop(1, '#000000');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Optic disc
    const discGrad = ctx.createRadialGradient(210, 250, 5, 210, 250, 35);
    discGrad.addColorStop(0, '#FFD699');
    discGrad.addColorStop(0.5, '#FFAA44');
    discGrad.addColorStop(1, '#CC7722');
    ctx.beginPath();
    ctx.arc(210, 250, 30, 0, Math.PI * 2);
    ctx.fillStyle = discGrad;
    ctx.fill();

    // Fovea
    const foveaGrad = ctx.createRadialGradient(300, 250, 2, 300, 250, 18);
    foveaGrad.addColorStop(0, '#1A0500');
    foveaGrad.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(300, 250, 18, 0, Math.PI * 2);
    ctx.fillStyle = foveaGrad;
    ctx.fill();

    // Blood vessels
    ctx.strokeStyle = '#661111';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';

    const drawVessel = (points) => {
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i][0], points[i][1]);
      }
      ctx.stroke();
    };

    // Major vessels from optic disc
    drawVessel([[210, 250], [230, 200], [260, 160], [300, 130], [350, 110]]);
    drawVessel([[210, 250], [230, 300], [260, 340], [300, 370], [350, 390]]);
    drawVessel([[210, 250], [250, 240], [310, 230], [370, 220]]);
    drawVessel([[210, 250], [250, 260], [310, 270], [370, 280]]);

    ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#551111';
    drawVessel([[260, 160], [280, 140], [310, 125]]);
    drawVessel([[260, 340], [280, 360], [310, 375]]);
    drawVessel([[310, 230], [330, 210], [355, 195]]);
    drawVessel([[310, 270], [330, 290], [355, 305]]);

    // Microaneurysms (small red dots)
    const lesionCount = caseData?.lesionCounts?.microaneurysms || 0;
    const maPositions = [
      [280, 180], [310, 195], [340, 170],
      [290, 310], [320, 330], [350, 340],
      [270, 220], [350, 250], [380, 200],
    ];
    ctx.fillStyle = '#CC2222';
    for (let i = 0; i < Math.min(lesionCount, maPositions.length); i++) {
      ctx.beginPath();
      ctx.arc(maPositions[i][0], maPositions[i][1], 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Hemorrhages (larger dark patches)
    const hemCount = caseData?.lesionCounts?.hemorrhages || 0;
    const hemPositions = [
      [290, 200, 8], [330, 300, 10], [260, 290, 7],
      [350, 230, 9], [300, 350, 8],
    ];
    ctx.fillStyle = 'rgba(100, 10, 10, 0.7)';
    for (let i = 0; i < Math.min(hemCount, hemPositions.length); i++) {
      ctx.beginPath();
      ctx.arc(hemPositions[i][0], hemPositions[i][1], hemPositions[i][2], 0, Math.PI * 2);
      ctx.fill();
    }

    // Hard exudates (yellowish spots)
    const exCount = caseData?.lesionCounts?.hardExudates || 0;
    const exPositions = [
      [310, 240, 4], [320, 260, 5], [295, 265, 3],
      [330, 245, 4], [340, 260, 3],
    ];
    ctx.fillStyle = 'rgba(255, 220, 100, 0.6)';
    for (let i = 0; i < Math.min(exCount, exPositions.length); i++) {
      ctx.beginPath();
      ctx.arc(exPositions[i][0], exPositions[i][1], exPositions[i][2], 0, Math.PI * 2);
      ctx.fill();
    }

    // Circular mask for retinal field
    ctx.globalCompositeOperation = 'destination-in';
    const maskGrad = ctx.createRadialGradient(width / 2, height / 2, 150, width / 2, height / 2, 230);
    maskGrad.addColorStop(0, 'rgba(0,0,0,1)');
    maskGrad.addColorStop(0.8, 'rgba(0,0,0,1)');
    maskGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = maskGrad;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
  }, [dimensions, caseData]);

  // Draw Grad-CAM overlay
  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { width, height } = dimensions;
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);

    if (!showOverlay) return;

    // Hotspots — areas of high attention
    const hotspots = [
      { x: 290, y: 190, r: 50, intensity: 0.8 },
      { x: 320, y: 310, r: 40, intensity: 0.7 },
      { x: 340, y: 250, r: 60, intensity: 0.5 },
      { x: 270, y: 280, r: 35, intensity: 0.6 },
      { x: 310, y: 195, r: 25, intensity: 0.9 },
    ];

    hotspots.forEach(spot => {
      const grad = ctx.createRadialGradient(spot.x, spot.y, 0, spot.x, spot.y, spot.r);
      grad.addColorStop(0, `rgba(255, 0, 0, ${spot.intensity * 0.6})`);
      grad.addColorStop(0.3, `rgba(255, 80, 0, ${spot.intensity * 0.4})`);
      grad.addColorStop(0.6, `rgba(255, 200, 0, ${spot.intensity * 0.2})`);
      grad.addColorStop(1, 'rgba(0, 0, 255, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    });

    // Circular mask
    ctx.globalCompositeOperation = 'destination-in';
    const maskGrad = ctx.createRadialGradient(width / 2, height / 2, 150, width / 2, height / 2, 230);
    maskGrad.addColorStop(0, 'rgba(0,0,0,1)');
    maskGrad.addColorStop(0.8, 'rgba(0,0,0,1)');
    maskGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = maskGrad;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
  }, [showOverlay, dimensions]);

  return (
    <div className="gradcam-viewer">
      <canvas ref={canvasRef} className="gradcam-viewer__fundus" />
      <canvas
        ref={overlayRef}
        className={`gradcam-viewer__overlay ${showOverlay ? 'gradcam-viewer__overlay--visible' : ''}`}
      />
      {/* Crosshair */}
      <div className="capture-zone__crosshair" />
      {/* Corner brackets */}
      <div className="gradcam-viewer__brackets">
        <span className="gradcam-viewer__bracket gradcam-viewer__bracket--tl" />
        <span className="gradcam-viewer__bracket gradcam-viewer__bracket--tr" />
        <span className="gradcam-viewer__bracket gradcam-viewer__bracket--bl" />
        <span className="gradcam-viewer__bracket gradcam-viewer__bracket--br" />
      </div>
    </div>
  );
};

/**
 * GradCamOverlay — picks the real image renderer when the case actually has
 * one, otherwise falls back to the synthetic illustration exactly as before.
 * This is the only exported entry point; CaseDetailPage's usage is unchanged.
 */
export const GradCamOverlay = ({ showOverlay, caseData }) => {
  // If the real /media image 404s or the connection drops mid-demo, drop to
  // the synthetic illustration instead of a broken-image icon — same
  // "never a visible error" rule as the API fallbacks.
  const [realImageFailed, setRealImageFailed] = useState(false);

  if (caseData?.imageUrl && !realImageFailed) {
    return (
      <RealGradCam
        showOverlay={showOverlay}
        caseData={caseData}
        onLoadError={() => setRealImageFailed(true)}
      />
    );
  }
  return <SyntheticGradCam showOverlay={showOverlay} caseData={caseData} />;
};
