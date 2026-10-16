// Readability measurements (render-side, headless-friendly). Renders the current view per
// lighting profile and reads the drawing buffer back:
//   ratio      = mean luminance of the tell-flare patch / scene mean luminance (target >= 2.5)
//   decayEdge  = Weber contrast of the decay edge band vs untouched ground
//   fireRadius = luminance of ground inside the fire radius / ground outside it
// The flare patch = pixels whose luminance rises by > 0.02 when the tell is pinned at peak.
import * as THREE from 'three';
import { DECAY, LAYOUT } from './props.js';
import { FIRE } from './lighting.js';

export const RIM_RATIO_MIN = 2.5;
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const LUT = new Float32Array(256).map((_, i) => lin(i));
function lumBuffer(gl) {
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const L = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) L[i] = 0.2126 * LUT[px[i * 4]] + 0.7152 * LUT[px[i * 4 + 1]] + 0.0722 * LUT[px[i * 4 + 2]];
  return { L, w, h };
}
function sampleAt(buf, camera, p, r = 3) {
  const v = new THREE.Vector3(...p).project(camera);
  if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) return null;
  const cx = Math.round((v.x * 0.5 + 0.5) * buf.w), cy = Math.round((v.y * 0.5 + 0.5) * buf.h); // GL origin bottom-left
  let s = 0, n = 0;
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if (x >= 0 && y >= 0 && x < buf.w && y < buf.h) { s += buf.L[y * buf.w + x]; n++; }
  return n ? s / n : null;
}

export function measureReadability({ standin = null, tellGain = () => 1, bloom = null, renderer, scene, camera, lighting, tell, props, decay, renderFrame, profiles = ['act1', 'act1_arena', 'act2', 'act2_boss', 'act3'], presence = [], unblockable = false }) {
  const gl = renderer.getContext();
  const runs = [...profiles.map((p) => ({ p, pres: false })), ...presence.map((p) => ({ p, pres: true }))];
  const prev = { profile: lighting.profile, pres: lighting.presence.on, presV: lighting.presence.value };
  const out = [];
  const settle = () => { lighting.update(0); const w = lighting.weights(); decay.uDecayOn.value = w.decay; props.update(0, w); standin?.setCloakRimMin(w.cloakRimMin); };
  for (const { p, pres } of runs) {
    lighting.setProfile(p, 0); lighting.setPresence(pres, true); settle();
    tell.hold(false); tell.update(0, tellGain()); renderFrame(); const off = lumBuffer(gl);
    tell.hold(true, { unblockable }); tell.update(0, tellGain());
    // Mask = the tell's own pixels, found with bloom off so the halo does not dilute the patch;
    // the patch luminance itself is read from the normal (bloom-on where enabled) frame.
    const bloomWas = bloom?.enabled; if (bloom) bloom.enabled = false;
    renderFrame(); const offNB = bloom ? (tell.hold(false), tell.update(0), renderFrame(), lumBuffer(gl)) : off;
    if (bloom) { tell.hold(true, { unblockable }); tell.update(0, tellGain()); renderFrame(); }
    const mask = lumBuffer(gl);
    if (bloom) bloom.enabled = bloomWas;
    renderFrame(); const on = lumBuffer(gl);
    let mean = 0, patch = 0, n = 0;
    for (let i = 0; i < off.L.length; i++) { mean += off.L[i]; if (mask.L[i] - offNB.L[i] > 0.02) { patch += on.L[i]; n++; } }
    mean /= off.L.length; patch = n ? patch / n : 0;
    const [dx, dz] = DECAY.center, R = DECAY.radius;
    const toCam = new THREE.Vector2(camera.position.x - dx, camera.position.z - dz).normalize();
    const at = (r) => [dx + toCam.x * r, 0.001, dz + toCam.y * r];
    const band = sampleAt(off, camera, at(R + DECAY.band * 0.5), 2), outside = sampleAt(off, camera, at(R + 0.9), 2), inside = sampleAt(off, camera, at(R * 0.5), 2);
    const [fx, , fz] = LAYOUT.fire;
    const fin = sampleAt(off, camera, [fx + 1.0, 0.001, fz + 1.0]), fout = sampleAt(off, camera, [fx + 4.5, 0.001, fz + 3.0]);
    const r3 = (v) => (v == null ? null : Math.round(v * 1000) / 1000);
    out.push({ profile: p, presence: pres, meanLum: r3(mean), tellLum: r3(patch), tellPixels: n, ratio: r3(mean > 0 ? patch / mean : 0),
      pass: mean > 0 && patch / mean >= RIM_RATIO_MIN,
      decayEdgeContrast: band != null && outside ? r3(Math.abs(band - outside) / outside) : null, decayInsideVsOutside: inside != null && outside ? r3(inside / outside) : null,
      fireRadiusRatio: fin != null && fout ? r3(fin / fout) : null, fireRadius: FIRE.distance });
  }
  tell.hold(false); lighting.setProfile(prev.profile, 0); lighting.setPresence(prev.pres, true); settle();
  return out;
}
