// Adapted intro for the central-system login.
// Slower, more deliberate pacing for a medical context.
// The eye draws itself in, blinks, blooms into colour, then hands off
// to the 3D anatomy view.
import { createEyeLayer, INK } from './eye.js';
import { clamp, lerp, phase, ease, smoothstep, smoothDamp } from './math.js';

/** Slower timeline — real-time pacing (speed 1×), ~6s total. */
export const T = {
  eyeIn: 0.0,       // Eye strands start drawing
  fill: 2.0,        // Sclera/iris fills appear (was 1.0)
  look1: 3.0,       // First saccade (was 1.6)
  look2: 3.8,       // Second saccade (was 2.1)
  settle: 4.4,      // Eye settles centre (was 2.5)
  blink: 5.0,       // The blink (was 2.8)
  bloom: 1.8,       // Duration of colour bloom — slower bloom (was 1.2)
  cue: 6.0,         // Scroll cue appears (was 3.5)
  done: 6.5,        // Intro complete (was 3.8)
};

function lookAt(t) {
  const s1 = phase(t, T.look1, 0.25, ease.outCubic);
  const s2 = phase(t, T.look2, 0.3, ease.outCubic);
  const s3 = phase(t, T.settle, 0.25, ease.outCubic);
  return {
    look: lerp(lerp(lerp(0, -1, s1), 1, s2), 0, s3),
    lookY: -0.12 * s1 * (1 - s2) + 0.06 * s2 * (1 - s3),
  };
}

function blinkAt(t, t0) {
  const d = t - t0;
  if (d < 0) return 0;
  if (d < 0.12) return ease.inOutSine(d / 0.12);
  if (d < 0.2) return 1;
  if (d < 0.5) return 1 - ease.outCubic((d - 0.2) / 0.3);
  return 0;
}

/**
 * Computes the eye layout from viewport dimensions.
 * The eye is centred slightly above the middle of the screen.
 */
function computeLayout(W, H) {
  const portrait = W / H < 0.9;
  const eyeW = Math.min(W, H) * (portrait ? 0.7 : 0.45);
  const eyeX = W / 2;
  const eyeY = H * 0.38;
  return {
    W, H, portrait,
    eye: { x: eyeX, y: eyeY, w: eyeW },
  };
}

export function createIntro({ ink: inkCanvas, reduced, debugT }) {
  const eyeLayer = createEyeLayer(inkCanvas);
  let t = reduced ? T.done + 0.01 : 0;
  let speed = 1; // Real-time — no acceleration (was 2)
  let L = null;
  let idleBlinks = [];
  const gaze = { x: 0, y: 0, tx: 0, ty: 0, vx: { v: 0 }, vy: { v: 0 } };
  const written = new Map();
  const put = (el, name, value) => {
    const key = `${el.id || el.className}|${name}`;
    if (written.get(key) === value) return;
    written.set(key, value);
    if (name.startsWith('--')) el.style.setProperty(name, value);
    else el.style[name] = value;
  };
  const frozen = debugT != null;
  if (frozen) t = debugT;

  function resize(W, H) {
    L = computeLayout(W, H);
    eyeLayer.resize(W, H, L, T);
    inkCanvas.style.transformOrigin = `${L.eye.x}px ${L.eye.y}px`;
    return L;
  }

  /** Called when the visitor scrolls, taps or presses a key mid-intro. */
  function hurry() {
    if (t < T.done && !frozen) speed = 2.5; // Gentle hurry (was 6)
  }

  /** Jump straight to the end of the intro (the skip link). */
  function finish() {
    if (!frozen) t = Math.max(t, T.done);
  }

  function nextIdleBlink(from) {
    idleBlinks.push(from + 3.2 + Math.random() * 3.5);
  }

  /**
   * Advances the intro and draws it.
   */
  function update(dt, o = {}) {
    if (!frozen) t += dt * speed;
    if (t >= T.done) speed = 1;
    if (!L) return { t, done: false };
    const { W, H } = L;

    const bloomT = t - (T.blink + 0.15);
    const maxR = Math.hypot(W, H) * 1.05 + Math.min(W, H) * 0.45;
    const bloomR = bloomT <= 0 ? 0 : maxR * ease.outCubic(clamp(bloomT / T.bloom));

    let blink = blinkAt(t, T.blink);
    if (!reduced && t > T.done) {
      if (!idleBlinks.length) nextIdleBlink(t);
      const b = idleBlinks[idleBlinks.length - 1];
      blink = Math.max(blink, blinkAt(t, b));
      if (t > b + 0.5) nextIdleBlink(t);
    }

    const { look, lookY } = lookAt(t);
    const following = t > T.done && !reduced && !(o.handoff > 0) && o.gaze;
    const want = following ? [clamp(o.gaze.x * 1.15, -0.95, 0.95), clamp(o.gaze.y, -0.8, 0.8)] : [0, 0];
    if (Math.hypot(want[0] - gaze.tx, want[1] - gaze.ty) > (following ? 0.14 : 0)) {
      gaze.tx = want[0];
      gaze.ty = want[1];
    }
    gaze.x = smoothDamp(gaze.x, gaze.tx, gaze.vx, 0.06, dt);
    gaze.y = smoothDamp(gaze.y, gaze.ty, gaze.vy, 0.06, dt);
    const drift = t > T.done && !reduced && !following ? 0.03 * Math.sin(t * 0.37) : 0;
    const eye = {
      ...L.eye,
      look: look + drift + gaze.x,
      lookY: lookY + gaze.y,
      blink: Math.min(1, blink + Math.max(0, gaze.y) * 0.14),
      pupil: lerp(0.44, 0.36, smoothstep(0, 1.4, bloomT)) + 0.008 * Math.sin(t * 1.9),
      globe: 0,
    };

    // Hand-off to the anatomical eye
    const h = o.handoff || 0;
    const ready = o.threeReady || o.fallback;
    if (h > 0) {
      const k = ease.inOutCubic(clamp(h / 0.7));
      eye.x = lerp(eye.x, o.target.x, k);
      eye.y = lerp(eye.y, o.target.y, k);
      eye.w = lerp(eye.w, o.target.w, k);
      eye.look *= 1 - k;
      eye.lookY *= 1 - k;
      eye.blink *= 1 - clamp(h * 5);
      eye.globe = smoothstep(0.3, 0.85, h);
      eye.globeR = lerp(eye.w * 0.205 * (12 / 5.85), o.target.globeR, k);
    }
    const handFade = ready ? smoothstep(0.74, 0.96, h) : 0;
    const lineFade = ready ? smoothstep(0.8, 1, h) : 0;

    const colourProgress = clamp(bloomT / 0.5);

    eyeLayer.render({
      t,
      eye,
      fill: phase(t, T.fill, 0.6, ease.inOutSine) * (1 - handFade),
      colour: colourProgress,
      ink: h > 0 ? mixInk(INK, '#efe8dc', smoothstep(0.2, 0.65, h)) : INK,
      lineAlpha: 1 - lineFade,
    });

    // Scene scaling during hand-off
    const hScale = 1 + 0.14 * ease.inOutSine(h);
    put(inkCanvas, 'opacity', (1 - smoothstep(0.55, 0.9, h)).toFixed(3));
    put(inkCanvas, 'transform', h > 0 ? `scale(${hScale.toFixed(4)})` : '');

    return { t, done: t >= T.done, eye, layout: L, bloomR };
  }

  return { resize, update, hurry, finish, get t() { return t; }, get layout() { return L; } };
}

function mixInk(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(lerp(pa >> 16, pb >> 16, t));
  const g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, t));
  const bl = Math.round(lerp(pa & 255, pb & 255, t));
  return `rgb(${r},${g},${bl})`;
}
