import React, { useState, useRef, useEffect, useCallback } from 'react';

const MIN_ZOOM = 0.5; // 50%
const MAX_ZOOM = 2.0; // 200%
const STEP = 0.1;     // 10% step

export const RetinalImageViewer = ({ src, alt = "Fundus Retinal Scan" }) => {
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef(null);

  // Reset zoom & pan when image src changes
  useEffect(() => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  }, [src]);

  const clampZoom = (val) => Math.min(Math.max(+val.toFixed(2), MIN_ZOOM), MAX_ZOOM);

  const handleZoomIn = (e) => {
    e?.stopPropagation();
    setZoom((prev) => clampZoom(prev + STEP));
  };

  const handleZoomOut = (e) => {
    e?.stopPropagation();
    setZoom((prev) => clampZoom(prev - STEP));
  };

  const handleSliderChange = (e) => {
    e?.stopPropagation();
    const val = parseFloat(e.target.value) / 100;
    setZoom(clampZoom(val));
  };

  const handleReset = (e) => {
    e?.stopPropagation();
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  };

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    // Smooth fractional delta based on wheel movement
    const delta = -e.deltaY * 0.0018;
    setZoom((prev) => clampZoom(prev + delta));
  }, []);

  const handleMouseDown = (e) => {
    // Enable panning whenever dragged
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - pan.x,
      y: e.clientY - pan.y,
    };
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleDoubleClick = (e) => {
    e.stopPropagation();
    if (Math.abs(zoom - 1.0) > 0.05) {
      setZoom(1.0);
      setPan({ x: 0, y: 0 });
    } else {
      setZoom(1.6);
    }
  };

  const isDefaultView = Math.abs(zoom - 1.0) < 0.01 && pan.x === 0 && pan.y === 0;

  return (
    <div
      className="retina-viewer-container"
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      title="Scroll or use slider to zoom (50% – 200%) • Drag to pan • Double-click to toggle"
      style={{
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
    >
      <img
        src={src}
        alt={alt}
        className="retina-viewer-img"
        style={{
          transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
          transformOrigin: 'center center',
          transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          willChange: 'transform',
        }}
        draggable={false}
      />

      {/* Floating HUD controls with smooth Range Slider */}
      <div className="retina-viewer-hud" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="retina-viewer-btn"
          onClick={handleZoomOut}
          disabled={zoom <= MIN_ZOOM}
          title="Zoom Out (Down to 50%)"
        >
          −
        </button>

        {/* Smooth range slider (50% to 200%) */}
        <input
          type="range"
          min="50"
          max="200"
          step="1"
          value={Math.round(zoom * 100)}
          onChange={handleSliderChange}
          className="retina-viewer-slider"
          title={`Zoom: ${Math.round(zoom * 100)}%`}
        />

        <button
          type="button"
          className="retina-viewer-btn"
          onClick={handleZoomIn}
          disabled={zoom >= MAX_ZOOM}
          title="Zoom In (Up to 200%)"
        >
          +
        </button>

        <button
          type="button"
          className="retina-viewer-badge-btn"
          onClick={handleReset}
          title="Click to reset to 100%"
        >
          {Math.round(zoom * 100)}%
        </button>

        {!isDefaultView && (
          <button
            type="button"
            className="retina-viewer-btn retina-viewer-btn--reset"
            onClick={handleReset}
            title="Reset (100% & Center)"
          >
            ⟲
          </button>
        )}
      </div>

      {!isDefaultView && (
        <div className="retina-viewer-hint">
          {Math.round(zoom * 100)}% • DRAG TO PAN
        </div>
      )}
    </div>
  );
};
