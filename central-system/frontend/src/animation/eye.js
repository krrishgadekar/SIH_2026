// Adapted eye layer for the central-system login.
// Removed: breeze/wind strand transitions from the experimental version.
// The eye starts already formed and draws itself in quickly with ink strands.
import { clamp, lerp, rng, smoothstep } from './math.js';

export const INK = '#1f1b16';

const bez = (a, b, c, d, s) => {
  const u = 1 - s;
  const k0 = u * u * u, k1 = 3 * u * u * s, k2 = 3 * u * s * s, k3 = s * s * s;
  return [k0 * a[0] + k1 * b[0] + k2 * c[0] + k3 * d[0], k0 * a[1] + k1 * b[1] + k2 * c[1] + k3 * d[1]];
};

/** Globe radius relative to the visible iris radius (12 mm / 5.85 mm). */
export const GLOBE_PER_IRIS = 12 / 5.85;

export function eyeGeometry(E) {
  const { x, y, w } = E;
  const b = E.blink || 0;
  const lk = E.look || 0;
  const g = E.globe || 0;
  const shift = lk * 0.045 * w;
  const P0 = [x - 0.5 * w, y + 0.015 * w];
  const P3 = [x + 0.5 * w, y - 0.005 * w];
  const P1 = [x - 0.24 * w + shift, lerp(y - 0.34 * w, y + 0.166 * w, b)];
  const P2 = [x + 0.2 * w + shift, lerp(y - 0.355 * w, y + 0.153 * w, b)];
  const Q1 = [x - 0.22 * w + shift * 0.5, y + 0.2 * w - 0.03 * w * b];
  const Q2 = [x + 0.23 * w + shift * 0.5, y + 0.185 * w - 0.03 * w * b];
  const C0 = [x - 0.36 * w, y - 0.14 * w + 0.1 * w * b];
  const C1 = [x - 0.2 * w + shift, lerp(y - 0.4 * w, y - 0.1 * w, b)];
  const C2 = [x + 0.22 * w + shift, lerp(y - 0.41 * w, y - 0.11 * w, b)];
  const C3 = [x + 0.44 * w, y - 0.12 * w + 0.1 * w * b];
  const r = 0.205 * w;
  const ix = x + lk * 0.17 * w;
  const iy = y + 0.012 * w + (E.lookY || 0) * 0.05 * w;
  const Rg = E.globeR ?? r * GLOBE_PER_IRIS;
  const toGlobe = (p, s, sign) => {
    if (!g) return p;
    const a = Math.PI * s;
    return [lerp(p[0], ix - Rg * Math.cos(a), g), lerp(p[1], iy + sign * Rg * Math.sin(a), g)];
  };
  return {
    upper: (s) => toGlobe(bez(P0, P1, P2, P3, s), s, -1),
    lower: (s) => toGlobe(bez(P0, Q1, Q2, P3, s), s, 1),
    crease: (s) => bez(C0, C1, C2, C3, s),
    iris: { x: ix, y: iy, r },
    pupilR: r * (E.pupil || 0.42),
    globeR: Rg,
  };
}

function curveOf(geo, spec) {
  if (spec.curve === 'iris') {
    const { x, y, r } = geo.iris;
    const R = r + spec.off;
    return (s) => {
      const a = -Math.PI / 2 + Math.PI * 2 * 1.03 * s;
      return [x + R * Math.cos(a), y + R * Math.sin(a)];
    };
  }
  return geo[spec.curve];
}

function sample(fn, n, off = 0) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    let p = fn(s);
    if (off) {
      const a = fn(Math.max(0, s - 0.01));
      const b = fn(Math.min(1, s + 0.01));
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const l = Math.hypot(dx, dy) || 1;
      p = [p[0] - (dy / l) * off, p[1] + (dx / l) * off];
    }
    pts.push(p);
  }
  return pts;
}

function strokeStrand(ctx, pts, w, alpha, color, taper) {
  const n = pts.length;
  if (n < 2 || alpha <= 0.002) return;
  const chunks = Math.min(14, n - 1);
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  for (let c = 0; c < chunks; c++) {
    const i0 = Math.floor((c * (n - 1)) / chunks);
    const i1 = Math.floor(((c + 1) * (n - 1)) / chunks);
    const u = (c + 0.5) / chunks;
    const tw = clamp(Math.min(u / taper, (1 - u) / taper));
    ctx.lineWidth = w * (0.2 + 0.8 * tw);
    ctx.beginPath();
    ctx.moveTo(pts[i0][0], pts[i0][1]);
    for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function makeIrisTexture(r, dpr, colourful) {
  const size = Math.ceil(r * 2 * dpr) + 2;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  x.scale(size / (r * 2), size / (r * 2));
  const R = rng(31);
  const g = x.createRadialGradient(r, r, r * 0.28, r, r, r);
  const stops = colourful
    ? ['#c08a4a', '#9a6534', '#74461f', '#3e2513']
    : ['#d2ccc2', '#b4ada2', '#958d82', '#5f5850'];
  g.addColorStop(0, stops[0]);
  g.addColorStop(0.4, stops[1]);
  g.addColorStop(0.82, stops[2]);
  g.addColorStop(1, stops[3]);
  x.fillStyle = g;
  x.beginPath();
  x.arc(r, r, r, 0, Math.PI * 2);
  x.fill();
  // Radial stromal fibres.
  x.lineCap = 'round';
  for (let i = 0; i < 180; i++) {
    const a = (i / 180) * Math.PI * 2 + R.gauss() * 0.01;
    const r0 = r * R.range(0.3, 0.4);
    const r1 = r * R.range(0.78, 0.98);
    const bend = R.gauss() * 0.05;
    x.strokeStyle = i % 3 === 0 ? (colourful ? 'rgba(236,190,120,0.35)' : 'rgba(255,255,255,0.35)') : colourful ? 'rgba(50,25,10,0.28)' : 'rgba(30,26,22,0.3)';
    x.lineWidth = r * R.range(0.008, 0.02);
    x.beginPath();
    x.moveTo(r + Math.cos(a) * r0, r + Math.sin(a) * r0);
    x.quadraticCurveTo(r + Math.cos(a + bend) * (r0 + r1) / 2, r + Math.sin(a + bend) * (r0 + r1) / 2, r + Math.cos(a) * r1, r + Math.sin(a) * r1);
    x.stroke();
  }
  // Collarette.
  x.strokeStyle = colourful ? 'rgba(224,176,108,0.55)' : 'rgba(250,248,240,0.5)';
  x.lineWidth = r * 0.03;
  x.beginPath();
  for (let i = 0; i <= 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const rr = r * (0.55 + 0.03 * Math.sin(a * 9 + 1) + 0.015 * R.gauss());
    i ? x.lineTo(r + Math.cos(a) * rr, r + Math.sin(a) * rr) : x.moveTo(r + Math.cos(a) * rr, r + Math.sin(a) * rr);
  }
  x.stroke();
  // Crypts.
  for (let i = 0; i < 12; i++) {
    const a = R() * Math.PI * 2;
    const d = r * R.range(0.6, 0.8);
    x.fillStyle = colourful ? 'rgba(45,22,8,0.35)' : 'rgba(40,36,32,0.3)';
    x.beginPath();
    x.ellipse(r + Math.cos(a) * d, r + Math.sin(a) * d, r * 0.05, r * 0.022, a, 0, Math.PI * 2);
    x.fill();
  }
  // Dark limbal ring.
  x.strokeStyle = colourful ? 'rgba(34,18,8,0.75)' : 'rgba(28,24,20,0.7)';
  x.lineWidth = r * 0.07;
  x.beginPath();
  x.arc(r, r, r * 0.965, 0, Math.PI * 2);
  x.stroke();
  return c;
}

export function createEyeLayer(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 1, H = 1, dpr = 1, L = null;
  let specs = [], irisTex = null;

  function resize(w, h, layout, T) {
    W = w;
    H = h;
    L = layout;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const E = L.eye;
    const base = eyeGeometry({ ...E });
    const R = rng(11);
    const k = E.w / 320;
    const few = L.portrait;
    const defs = [];
    const add = (curve, n, off0, off1, w0, w1, a0, a1) => {
      for (let i = 0; i < n; i++) {
        defs.push({
          curve,
          off: lerp(off0, off1, n > 1 ? i / (n - 1) : 0.5) * k + R.gauss() * 0.3 * k,
          w: Math.max(0.6, R.range(w0, w1) * k),
          a: R.range(a0, a1),
        });
      }
    };
    add('upper', few ? 4 : 6, -2.8, 1.2, 0.7, 1.5, 0.6, 0.95);
    defs[few ? 2 : 4].w = 2.6 * Math.max(0.8, k);
    defs[few ? 2 : 4].a = 1;
    add('lower', few ? 3 : 4, -0.6, 1.8, 0.7, 1.4, 0.55, 0.9);
    add('crease', 2, 0, 2.6, 0.6, 1.0, 0.3, 0.5);
    add('iris', few ? 3 : 4, -1.2, 1.6, 0.8, 1.6, 0.6, 0.95);

    // Strands draw directly onto the eye curves with a slow staggered reveal.
    specs = defs.map((d, i) => {
      const drawStart = T.eyeIn + i * 0.06;  // Wider stagger (was 0.02)
      const drawDur = R.range(0.8, 1.4);     // Slower draw (was 0.4-0.7)
      return { ...d, drawStart, drawDur };
    });

    irisTex = [makeIrisTexture(base.iris.r, dpr, false), makeIrisTexture(base.iris.r, dpr, true)];
  }

  function openingPath(geo) {
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const p = geo.upper(i / 40);
      i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
    }
    for (let i = 40; i >= 0; i--) {
      const p = geo.lower(i / 40);
      ctx.lineTo(p[0], p[1]);
    }
    ctx.closePath();
  }

  function drawFills(geo, S) {
    const { iris } = geo;
    const w = S.eye.w;
    ctx.save();
    openingPath(geo);
    ctx.globalAlpha = S.fill;
    ctx.fillStyle = '#fcf9f3';
    ctx.fill();
    ctx.clip();

    const [mono, col] = irisTex;
    const d = iris.r * 2;
    ctx.drawImage(mono, iris.x - iris.r, iris.y - iris.r, d, d);
    if (S.colour > 0) {
      ctx.globalAlpha = S.fill * S.colour;
      ctx.drawImage(col, iris.x - iris.r, iris.y - iris.r, d, d);
    }
    ctx.globalAlpha = S.fill;
    const pg = ctx.createRadialGradient(iris.x, iris.y, geo.pupilR * 0.8, iris.x, iris.y, geo.pupilR * 1.12);
    pg.addColorStop(0, '#0d0a08');
    pg.addColorStop(1, 'rgba(13,10,8,0)');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(iris.x, iris.y, geo.pupilR * 1.12, 0, Math.PI * 2);
    ctx.fill();

    // Lid shadow across the top of the globe.
    const top = S.eye.y - w * 0.3;
    const sh = ctx.createLinearGradient(0, top, 0, S.eye.y + w * 0.05);
    sh.addColorStop(0, `rgba(70,50,35,${0.28 * (1 - S.eye.globe)})`);
    sh.addColorStop(1, 'rgba(70,50,35,0)');
    ctx.fillStyle = sh;
    ctx.fillRect(S.eye.x - w, top, w * 2, w * 0.4);

    // Catchlights.
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.ellipse(iris.x + iris.r * 0.3, iris.y - iris.r * 0.32, iris.r * 0.13, iris.r * 0.11, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = S.fill * 0.35;
    ctx.beginPath();
    ctx.arc(iris.x - iris.r * 0.24, iris.y + iris.r * 0.3, iris.r * 0.045, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * @returns {{ brandHead: number, settled: boolean }}
   */
  function render(S) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const geo = eyeGeometry(S.eye);
    const t = S.t;
    const la = S.lineAlpha ?? 1;

    if (S.fill > 0) drawFills(geo, S);

    // Draw each strand directly on the eye curves with a staggered reveal
    for (const sp of specs) {
      const u = clamp((t - sp.drawStart) / sp.drawDur);
      if (u <= 0) continue;
      const alpha = sp.a * la * (sp.curve === 'crease' ? 1 - (S.eye.globe || 0) : 1);

      const fn = curveOf(geo, sp);
      const allPts = sample(fn, 56, sp.curve === 'iris' ? 0 : sp.off);

      if (sp.curve === 'iris') {
        ctx.save();
        openingPath(geo);
        ctx.clip();
      }

      if (u < 1) {
        // Partial reveal: draw only u fraction of the strand
        const count = Math.max(2, Math.floor(allPts.length * u));
        strokeStrand(ctx, allPts.slice(0, count), sp.w, alpha, S.ink, 0.08);
      } else {
        strokeStrand(ctx, allPts, sp.w, alpha, S.ink, 0.08);
      }

      if (sp.curve === 'iris') ctx.restore();
    }

    return { brandHead: Infinity, settled: true };
  }

  return { resize, render };
}
