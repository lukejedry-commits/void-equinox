// On-screen touch controls (touch devices only). INPUT-SIDE: the move stick is quantized
// to int16 before it reaches the input layer; look drags turn the render camera, whose
// yaw reaches the sim only as the recorded, quantized yawQ. Nothing here touches the sim.
import { TOUCH } from '../config/feel.js';
import { quantizeAxis } from '../core/touchstick.js';

const D = Math.PI / 180;
export const isTouchDevice = () => (globalThis.matchMedia?.('(pointer: coarse)').matches || (navigator.maxTouchPoints || 0) > 0);

// Button centres as offsets from the bottom-right corner (CSS px, 1x density).
export function buttonLayout(B = TOUCH.buttons) {
  const g = B.gapPx, m = B.marginPx;
  const dodge = { r: m + B.dodge / 2, b: m + B.dodge / 2, size: B.dodge };
  const light = { r: m + B.dodge + g + B.light / 2, b: dodge.b, size: B.light };            // left of dodge
  const heavy = { r: light.r, b: light.b + B.light / 2 + g + B.heavy / 2, size: B.heavy };    // above light
  const fire = { r: dodge.r, b: dodge.b + B.dodge / 2 + g + B.fire / 2, size: B.fire };        // above dodge
  const lock = { r: m + B.lock / 2, b: fire.b + B.fire / 2 + g + B.lock / 2, size: B.lock };  // top-right of the cluster
  return { dodge, light, heavy, fire, lock };
}

export function createTouchControls({ input, camera: tps, root = document.body }) {
  if (!isTouchDevice()) return null;
  const S = TOUCH.stick, L = TOUCH.look;
  const css = document.createElement('style');
  css.textContent = `#touch{position:fixed;inset:0;z-index:15;touch-action:none;user-select:none;-webkit-user-select:none}
#touch .btn{position:absolute;border-radius:50%;border:2px solid #ffd9a088;background:#1a0f0a66;color:#ffd9a0;font:600 12px system-ui;display:flex;align-items:center;justify-content:center;transform:translate(50%,50%)}
#touch .btn.on{background:#ff8a3a55}
#touch .stick{position:absolute;border-radius:50%;border:2px solid #ffd9a055;pointer-events:none;display:none;transform:translate(-50%,-50%)}
#touch .knob{position:absolute;width:56px;height:56px;border-radius:50%;background:#ffd9a066;pointer-events:none;display:none;transform:translate(-50%,-50%)}
#hint{display:none}`;
  document.head.appendChild(css);
  const el = document.createElement('div'); el.id = 'touch'; root.appendChild(el);
  const ring = Object.assign(document.createElement('div'), { className: 'stick' });
  ring.style.width = ring.style.height = `${S.radiusPx * 2}px`;
  const knob = Object.assign(document.createElement('div'), { className: 'knob' });
  el.append(ring, knob);
  const btn = {};
  for (const [k, p] of Object.entries(buttonLayout())) {
    const b = document.createElement('div'); b.className = 'btn'; b.dataset.k = k;
    b.textContent = { dodge: 'DODGE', light: 'LIGHT', heavy: 'HEAVY', fire: 'FIRE', lock: 'LOCK' }[k];
    const hit = Math.max(p.size, TOUCH.buttons.minTargetPx);
    Object.assign(b.style, { width: `${hit}px`, height: `${hit}px`, right: `${p.r}px`, bottom: `${p.b}px` });
    el.appendChild(b); btn[k] = b;
  }

  const ptr = new Map(); // pointerId -> role state
  let lookPending = { yaw: 0, pitch: 0 };
  const now = () => performance.now() / 1000;

  el.addEventListener('pointerdown', (e) => {
    e.preventDefault(); el.setPointerCapture?.(e.pointerId);
    const k = e.target.dataset?.k;
    if (k) { // button
      btn[k].classList.add('on');
      const st = { role: 'btn', k, t0: now(), sprint: false };
      if (k === 'dodge') st.timer = setTimeout(() => { st.sprint = true; input.setTouchSprint(true); }, TOUCH.dodgeHoldSprintSec * 1000);
      ptr.set(e.pointerId, st); return;
    }
    if (e.clientX < innerWidth * S.areaFrac) { // floating move stick
      ptr.set(e.pointerId, { role: 'stick', ox: e.clientX, oy: e.clientY });
      Object.assign(ring.style, { left: `${e.clientX}px`, top: `${e.clientY}px`, display: 'block' });
      Object.assign(knob.style, { left: `${e.clientX}px`, top: `${e.clientY}px`, display: 'block' });
      input.setTouchStick(0, 0, true); return;
    }
    ptr.set(e.pointerId, { role: 'look', x: e.clientX, y: e.clientY, sx: e.clientX, t0: now() });
  });
  el.addEventListener('pointermove', (e) => {
    const st = ptr.get(e.pointerId); if (!st) return;
    if (st.role === 'stick') {
      let dx = (e.clientX - st.ox) / S.radiusPx, dy = (e.clientY - st.oy) / S.radiusPx;
      const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
      input.setTouchStick(quantizeAxis(dx), quantizeAxis(dy), true); // quantize first; shaping is sim-input side
      Object.assign(knob.style, { left: `${st.ox + dx * S.radiusPx}px`, top: `${st.oy + dy * S.radiusPx}px` });
    } else if (st.role === 'look') {
      // linear (no acceleration): 0.25 deg per px
      lookPending.yaw -= (e.clientX - st.x) * L.degPerPx * D; lookPending.pitch += (e.clientY - st.y) * L.degPerPx * D;
      st.x = e.clientX; st.y = e.clientY;
    }
  });
  const end = (e) => {
    const st = ptr.get(e.pointerId); if (!st) return; ptr.delete(e.pointerId);
    if (st.role === 'stick') { input.setTouchStick(0, 0, false); ring.style.display = knob.style.display = 'none'; return; }
    if (st.role === 'look') {
      const dx = e.clientX - st.sx;
      if (tps.locked && Math.abs(dx) >= L.swipePx && now() - st.t0 <= L.swipeMaxSec) tps.switchTarget(Math.sign(dx)); // swipe switches target
      return;
    }
    btn[st.k].classList.remove('on');
    const held = now() - st.t0;
    if (st.k === 'dodge') { clearTimeout(st.timer); if (st.sprint) input.setTouchSprint(false); else input.pressDodge(); }
    else if (st.k === 'lock') tps.toggleLock();
    else if (st.k === 'heavy') input.press('heavy', { charged: held >= TOUCH.heavyChargeSec });
    else input.press(st.k);
  };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);

  return {
    el,
    // Per render frame: apply the smoothed look delta (0.05 s exponential, no accel).
    update(dt) {
      const k = 1 - Math.exp(-dt / L.smoothingSec);
      const y = lookPending.yaw * k, p = lookPending.pitch * k;
      lookPending.yaw -= y; lookPending.pitch -= p;
      if (y || p) tps.turn(y, p);
    },
  };
}
