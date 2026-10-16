// Third-person over-the-shoulder camera. RENDER-SIDE ONLY: reads physics state
// (interpolated mesh position, read-only shape casts) and never writes to the sim.
// The sim only ever sees the camera yaw through the recorded, quantized input
// field `yawQ` (see core/input.js), so replays are independent of this module.
import * as THREE from 'three';
import { RAPIER } from '../physics/world.js';

const D = Math.PI / 180;
// TODO(Mechanics): every number below is a placeholder (values from Graphics brief).
export const CAMERA_TUNING = {
  fovDeg: 60,              // vertical FOV. TODO(Mechanics)
  near: 0.1,               // TODO(Mechanics)
  distance: 4.5,           // metres behind pivot (landscape). TODO(Mechanics)
  portraitHFovDeg: 65,     // portrait (aspect < 1): vertical FOV chosen so horizontal FOV >= this
  portraitDistance: 5.5,   // portrait camera distance, metres
  frameBlend: 6,           // 1/s exponential blend of FOV/distance on orientation change
  shoulder: 0.6,           // metres right of pivot (Solenius sits left of centre). TODO(Mechanics)
  pivotHeight: 0.9,        // above capsule centre == 1.8 m above feet (head). TODO(Mechanics)
  aimUp: 0.55,             // look point above pivot -> character in the lower third. TODO(Mechanics)
  pitchMinDeg: -35, pitchMaxDeg: 60, // TODO(Mechanics)
  defaultPitchDeg: 12,     // TODO(Mechanics)
  mouseSens: 0.0025,       // rad per pixel. TODO(Mechanics)
  stickSens: 2.6,          // rad/s at full right-stick deflection. TODO(Mechanics)
  keySens: 2.0,            // rad/s for arrow keys. TODO(Mechanics)
  stickDeadzone: 0.15,     // TODO(Mechanics)
  rotSmoothing: 14,        // 1/s exponential yaw/pitch smoothing. TODO(Mechanics)
  posSmoothing: 18,        // 1/s pivot follow smoothing. TODO(Mechanics)
  collisionRadius: 0.2,    // sphere-cast radius. TODO(Mechanics)
  collisionMargin: 0.05,   // TODO(Mechanics)
  pullOutSpeed: 4,         // 1/s ease back out after a pull-in (pull-in is instant). TODO(Mechanics)
  fadeDistance: 1.2,       // fade cloak when camera closer than this to pivot. TODO(Mechanics)
  fadeOpacity: 0.4,        // TODO(Mechanics)
  lockRange: 15,           // metres. TODO(Mechanics)
  lockBreakRange: 18,      // TODO(Mechanics)
  lockPitchDeg: 14,        // TODO(Mechanics)
  lockSmoothing: 6,        // 1/s yaw swing while locked. TODO(Mechanics)
  lockFrameBias: 0.35,     // look point moves this far from player toward target. TODO(Mechanics)
};

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);

// targets: [{ position: () => {x,y,z}, onLock?: (bool) => void }]
export function createTPSCamera({ camera = new THREE.PerspectiveCamera(), phys = null, targets = [], tuning = CAMERA_TUNING, onFade = null } = {}) {
  const T = tuning;
  camera.fov = T.fovDeg; camera.near = T.near; camera.updateProjectionMatrix();
  const st = { yaw: 0, pitch: T.defaultPitchDeg * D, tYaw: 0, tPitch: T.defaultPitchDeg * D, dist: T.distance, lock: null,
    fov: T.fovDeg, baseDist: T.distance, framed: false };
  // Portrait framing (render-side only): target FOV / distance from the current aspect.
  function frameTargets() {
    const a = camera.aspect;
    if (a < 1) return { fov: 2 * Math.atan(Math.tan((T.portraitHFovDeg * D) / 2) / a) / D, dist: T.portraitDistance };
    return { fov: T.fovDeg, dist: T.distance };
  }
  function applyFraming(dt) {
    const t = frameTargets();
    const k = st.framed ? ease(T.frameBlend, dt) : 1; st.framed = true;
    st.fov += (t.fov - st.fov) * k; st.baseDist += (t.dist - st.baseDist) * k;
    if (Math.abs(camera.fov - st.fov) > 1e-4) { camera.fov = st.fov; camera.updateProjectionMatrix(); }
  }
  const pivot = new THREE.Vector3(), haveP = { v: false };
  const keys = new Set();
  let mdx = 0, mdy = 0;
  const ball = phys ? new RAPIER.Ball(T.collisionRadius) : null;
  const tmp = new THREE.Vector3(), look = new THREE.Vector3(), want = new THREE.Vector3();

  function nearestTarget(p) {
    let best = null, bd = T.lockRange;
    for (const t of targets) { const q = t.position(); const d = Math.hypot(q.x - p.x, q.z - p.z); if (d <= bd) { bd = d; best = t; } }
    return best;
  }
  function setLock(t) { st.lock?.onLock?.(false); st.lock = t; t?.onLock?.(true); }
  function toggleLock() { if (st.lock) setLock(null); else setLock(nearestTarget(pivot)); }

  // Distance along pivot->desired the sphere can travel before hitting static geometry.
  function collide(from, to) {
    if (!phys) return 1;
    const v = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
    const len = Math.hypot(v.x, v.y, v.z); if (len < 1e-6) return 1;
    const hit = phys.world.castShape(from, { x: 0, y: 0, z: 0, w: 1 }, v, ball, 0, 1, true,
      undefined, undefined, undefined, undefined, (c) => { const b = c.parent(); return !!b && b.isFixed(); });
    if (!hit) return 1;
    return Math.max(0, hit.time_of_impact - T.collisionMargin / len);
  }

  function update(dt, playerPos) {
    applyFraming(dt);
    // --- input (render side) ---
    let dy = -mdx * T.mouseSens, dp = mdy * T.mouseSens; mdx = mdy = 0;
    dy += ((keys.has('ArrowLeft') ? 1 : 0) - (keys.has('ArrowRight') ? 1 : 0)) * T.keySens * dt;
    dp += ((keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0)) * T.keySens * dt;
    const pads = globalThis.navigator?.getGamepads?.() ?? [];
    for (const g of pads) {
      if (!g) continue;
      const rx = g.axes[2] ?? 0, ry = g.axes[3] ?? 0;
      if (Math.abs(rx) > T.stickDeadzone) dy -= rx * T.stickSens * dt;
      if (Math.abs(ry) > T.stickDeadzone) dp += ry * T.stickSens * dt;
      const r3 = g.buttons[11]?.pressed; if (r3 && !g.__r3) toggleLock(); g.__r3 = r3;
      break;
    }
    // --- pivot follow ---
    want.set(playerPos.x, playerPos.y + T.pivotHeight, playerPos.z);
    if (!haveP.v) { pivot.copy(want); haveP.v = true; } else pivot.lerp(want, ease(T.posSmoothing, dt));
    // --- orientation targets ---
    if (st.lock) {
      const q = st.lock.position();
      const d = Math.hypot(q.x - pivot.x, q.z - pivot.z);
      if (d > T.lockBreakRange) setLock(null);
      else {
        const goal = Math.atan2(-(q.x - pivot.x), -(q.z - pivot.z)); // face the target
        st.tYaw += wrap(goal - st.tYaw) * ease(T.lockSmoothing, dt);
        st.tPitch += (T.lockPitchDeg * D - st.tPitch) * ease(T.lockSmoothing, dt);
      }
    }
    if (!st.lock) { st.tYaw += dy; st.tPitch += dp; }
    st.tPitch = Math.min(T.pitchMaxDeg * D, Math.max(T.pitchMinDeg * D, st.tPitch));
    const k = ease(T.rotSmoothing, dt);
    st.yaw = wrap(st.yaw + wrap(st.tYaw - st.yaw) * k); st.tYaw = st.yaw + wrap(st.tYaw - st.yaw);
    st.pitch += (st.tPitch - st.pitch) * k;
    // --- desired position: behind + shoulder offset ---
    const sy = Math.sin(st.yaw), cy = Math.cos(st.yaw), sp = Math.sin(st.pitch), cp = Math.cos(st.pitch);
    const shoulder = tmp.set(pivot.x + cy * T.shoulder, pivot.y, pivot.z - sy * T.shoulder);
    const sf = collide(pivot, shoulder); // keep the shoulder offset itself out of walls
    shoulder.set(pivot.x + (shoulder.x - pivot.x) * sf, pivot.y, pivot.z + (shoulder.z - pivot.z) * sf);
    const full = new THREE.Vector3(shoulder.x + sy * cp * st.baseDist, shoulder.y + sp * st.baseDist, shoulder.z + cy * cp * st.baseDist);
    const f = collide(shoulder, full);
    const allowed = f * st.baseDist;
    st.dist = allowed < st.dist ? allowed : st.dist + (allowed - st.dist) * ease(T.pullOutSpeed, dt);
    camera.position.set(shoulder.x + sy * cp * st.dist, shoulder.y + sp * st.dist, shoulder.z + cy * cp * st.dist);
    // --- look point: ahead along view, raised so the character sits in the lower third ---
    look.set(shoulder.x - sy * cp * 10, shoulder.y + T.aimUp - sp * 10, shoulder.z - cy * cp * 10);
    if (st.lock) { // keep player + target framed: aim between them
      const q = st.lock.position();
      const mid = tmp.set(pivot.x + (q.x - pivot.x) * T.lockFrameBias, pivot.y + T.aimUp + (q.y - pivot.y) * T.lockFrameBias, pivot.z + (q.z - pivot.z) * T.lockFrameBias);
      look.set(mid.x + cy * T.shoulder, mid.y, mid.z - sy * T.shoulder);
    }
    camera.lookAt(look);
    const near = camera.position.distanceTo(pivot);
    onFade?.(near < T.fadeDistance ? T.fadeOpacity : 1, near);
    return st;
  }

  function attach(el, win = window) {
    el.addEventListener('click', () => { if (document.pointerLockElement !== el) el.requestPointerLock?.(); });
    win.addEventListener('mousemove', (e) => { if (document.pointerLockElement === el) { mdx += e.movementX; mdy += e.movementY; } });
    win.addEventListener('mousedown', (e) => { if (e.button === 1) { e.preventDefault(); toggleLock(); } });
    win.addEventListener('keydown', (e) => { if (e.code === 'Tab') { e.preventDefault(); if (!e.repeat) toggleLock(); } keys.add(e.code); });
    win.addEventListener('keyup', (e) => keys.delete(e.code));
    win.addEventListener('blur', () => keys.clear());
  }

  return {
    camera, state: st, update, attach, toggleLock,
    get yaw() { return st.yaw; },
    // Programmatic orbit (tests / scripted shots).
    orbit(dYaw, dPitch = 0) { if (!st.lock) { st.tYaw += dYaw; st.tPitch += dPitch; } },
    setYaw(y, p = st.pitch) { st.yaw = st.tYaw = y; st.pitch = st.tPitch = p; },
    get locked() { return st.lock; },
    get framing() { return { fov: st.fov, distance: st.baseDist, portrait: camera.aspect < 1 }; },
  };
}
