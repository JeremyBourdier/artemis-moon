import * as THREE from 'three';
import { createSceneContext } from './scene.js';
import { createMoonSurface } from './moon.js';
import { createArtemisLander } from './lander.js';
import { createRegolithDust } from './dust.js';
import { createCameraRig } from './camera.js';
import { createPostProcessing } from './post.js';

const LOOP_DURATION = 18;

const PHASES = [
  { name: 'descent', start: 0 },
  { name: 'burn', start: 4 },
  { name: 'touchdown', start: 8 },
  { name: 'settle', start: 11 },
  { name: 'hero', start: 14 },
];

const ALTITUDE_KEYFRAMES = [
  { t: 0.0, y: 40.0 },
  { t: 4.0, y: 21.5 },
  { t: 8.0, y: 5.0 },
  { t: 10.6, y: 0.9 },
  { t: 11.0, y: 0.0 },
  { t: 18.0, y: 0.0 },
];

const THROTTLE_KEYFRAMES = [
  { t: 0.0, v: 0.0 },
  { t: 4.0, v: 0.0 },
  { t: 4.35, v: 0.92 },
  { t: 5.4, v: 1.0 },
  { t: 8.1, v: 0.88 },
  { t: 9.4, v: 0.6 },
  { t: 10.5, v: 0.3 },
  { t: 11.0, v: 0.0 },
  { t: 18.0, v: 0.0 },
];

function smootherstep(edge0, edge1, x) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function sampleKeyframes(keyframes, t, valueKey) {
  let k0 = keyframes[0];
  let k1 = keyframes[keyframes.length - 1];
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (t >= keyframes[i].t && t <= keyframes[i + 1].t) {
      k0 = keyframes[i];
      k1 = keyframes[i + 1];
      break;
    }
  }
  const span = Math.max(0.0001, k1.t - k0.t);
  const a = smootherstep(0, 1, (t - k0.t) / span);
  return THREE.MathUtils.lerp(k0[valueKey], k1[valueKey], a);
}

function wrapTime(t) {
  return ((t % LOOP_DURATION) + LOOP_DURATION) % LOOP_DURATION;
}

function getPhaseName(t) {
  let phase = PHASES[0].name;
  for (const p of PHASES) {
    if (t >= p.start) phase = p.name;
  }
  return phase;
}

function altitudeAt(t) {
  return sampleKeyframes(ALTITUDE_KEYFRAMES, t, 'y');
}

function altitudeVelocityAt(t) {
  const h = 0.02;
  const t0 = Math.max(0, t - h);
  const t1 = Math.min(LOOP_DURATION, t + h);
  return (altitudeAt(t1) - altitudeAt(t0)) / (t1 - t0);
}

function suspensionDipAt(t) {
  if (t < 10.9) return 0;
  const dt = t - 10.9;
  const bounce = 0.3 * Math.exp(-dt * 1.4) * Math.sin(dt * 7.0);
  const settled = 0.055 * smootherstep(0, 2.2, dt);
  return Math.max(0, bounce) + settled;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setStyleWidth(id, pct) {
  const el = document.getElementById(id);
  if (el) el.style.width = `${pct}%`;
}

const container = document.getElementById('app');
const ctx = createSceneContext(container);
const { scene, update: updateScene, resize: resizeScene } = ctx;

const moon = createMoonSurface(scene);
const lander = createArtemisLander(scene);
const dust = createRegolithDust(scene);
const cameraRig = createCameraRig();
const post = createPostProcessing(ctx.renderer, scene, cameraRig.camera);

const params = new URLSearchParams(window.location.search);
const staticMode = params.get('static') === '1';

let currentTime = 0;
if (params.has('t')) {
  const n = Number.parseFloat(params.get('t'));
  if (Number.isFinite(n)) currentTime = wrapTime(n);
}

let paused = false;
let ready = false;
let disposed = false;
const timer = new THREE.Timer();

function updateHud(t, altitude, throttle) {
  setText('hud-alt', `${String(Math.max(0, Math.round(altitude))).padStart(3, '0')} m`);
  const vel = altitudeVelocityAt(t);
  const sign = vel < 0 ? '-' : '+';
  setText('hud-vel', `${sign}${Math.abs(vel).toFixed(1).padStart(4, '0')} m/s`);
  setText('hud-thr', `${String(Math.round(throttle * 100)).padStart(3, '0')} %`);
  setText('hud-phase', `PHASE // ${getPhaseName(t).toUpperCase()}`);
  setText(
    'hud-time',
    `T+ ${t.toFixed(1).padStart(5, '0')}s / ${LOOP_DURATION.toFixed(1)}s`
  );
  setStyleWidth('hud-progress', (t / LOOP_DURATION) * 100);
}

function renderFrame(loopT) {
  const altitude = altitudeAt(loopT);
  const throttle = sampleKeyframes(THROTTLE_KEYFRAMES, loopT, 'v');
  const proximity = THREE.MathUtils.clamp(1 - altitude / 14, 0, 1);
  const dustIntensity = throttle * proximity;
  const dustSettle = smootherstep(11.2, 13.8, loopT);
  const suspensionDip = suspensionDipAt(loopT);
  const rcsActive = loopT < 8.6 ? 1 : 0;
  const landingEnvelope = 1 - smootherstep(9.5, 11.6, loopT);
  const tiltX = Math.sin(loopT * 0.85) * 0.05 * landingEnvelope;
  const tiltZ = Math.cos(loopT * 0.7 + 1.3) * 0.045 * landingEnvelope;
  const cameraShake = throttle * (0.35 + 0.85 * proximity);

  updateScene(loopT);
  lander.update({ altitude, throttle, suspensionDip, rcsActive, tiltX, tiltZ }, loopT);
  dust.update({ dustIntensity, dustSettle, throttle }, loopT);
  cameraRig.update({ altitude, cameraShake }, loopT);
  post.render(loopT);

  updateHud(loopT, altitude, throttle);
}

function markReady() {
  if (!ready) {
    ready = true;
    window.__SCENE_READY__ = true;
  }
}

function tick() {
  if (disposed) return;
  requestAnimationFrame(tick);
  timer.update();
  const delta = paused ? 0 : Math.min(timer.getDelta(), 0.05);
  currentTime += delta;
  renderFrame(wrapTime(currentTime));
  markReady();
}

const api = {
  setPhase(name) {
    const phase = PHASES.find((p) => p.name === name);
    if (!phase) return false;
    currentTime = phase.start;
    return true;
  },
  getPhase() {
    return getPhaseName(wrapTime(currentTime));
  },
  pause() {
    paused = true;
  },
  resume() {
    paused = false;
    timer.reset();
  },
  seek(t) {
    const n = Number(t);
    if (Number.isFinite(n)) currentTime = wrapTime(n);
  },
};
window.__ARTEMIS__ = api;

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  resizeScene(w, h);
  cameraRig.resize(w, h);
  post.resize(w, h);
}
window.addEventListener('resize', onResize);

window.addEventListener('beforeunload', () => {
  disposed = true;
  window.removeEventListener('resize', onResize);
  moon.dispose();
  lander.dispose();
  dust.dispose();
  post.dispose();
  ctx.dispose();
});

if (staticMode) {
  renderFrame(wrapTime(currentTime));
  markReady();
} else {
  requestAnimationFrame(tick);
}
