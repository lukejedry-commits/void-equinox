// Low / Medium / High presets with auto-detect and persisted override.
// smokeResScale: smoke layer render-target scale (0 = no smoke layer). Not yet consumed; read it when the smoke pass lands.
export const PRESETS = {
  low:    { name: 'Low',    fpsCap: 30, resScale: 0.75, pixelRatioCap: 1.5, shadowMapSize: 1024, dirLights: 1, pointLights: 1, bloom: false, bloomRes: 0,    bloomMips: 0, bakeGrade: true,  particleCap: 2000,  smokeResScale: 0 },
  medium: { name: 'Medium', fpsCap: 60, resScale: 0.75, pixelRatioCap: 2,   shadowMapSize: 1536, dirLights: 1, pointLights: 2, bloom: true,  bloomRes: 0.25, bloomMips: 3, bakeGrade: true,  particleCap: 4000,  smokeResScale: 0 }, // final (Graphics & Atmosphere)
  high:   { name: 'High',   fpsCap: 60, resScale: 1.0,  pixelRatioCap: 2,   shadowMapSize: 2048, dirLights: 1, pointLights: 2, bloom: true,  bloomRes: 0.5,  bloomMips: 5, bakeGrade: false, particleCap: 6000,  smokeResScale: 0.5 }, // final (Graphics & Atmosphere)
};
const KEY = 'voidEquinox.quality'; // 'auto' | 'low' | 'medium' | 'high'

export function loadOverride(storage = globalThis.localStorage) {
  try { return storage?.getItem(KEY) || 'auto'; } catch { return 'auto'; }
}
export function saveOverride(v, storage = globalThis.localStorage) {
  try { storage?.setItem(KEY, v); } catch { /* ignore */ }
}

// Auto: start at High; whenever the average frame time over a 2 s window exceeds 20 ms,
// step down ONE tier (High -> Medium -> Low). Never steps back up within a session.
export const AUTO = { stepDownAboveMs: 20, windowSec: 2 };
const ORDER = ['high', 'medium', 'low'];
export function createQuality({ onChange, storage = globalThis.localStorage, windowSec = AUTO.windowSec, aboveMs = AUTO.stepDownAboveMs } = {}) {
  const override = loadOverride(storage);
  let auto = override === 'auto';
  let tier = auto ? 'high' : override;
  let elapsed = 0, frames = 0;
  const set = (t) => { tier = t; onChange?.(PRESETS[t], t); };
  return {
    get tier() { return tier; }, get preset() { return PRESETS[tier]; }, get auto() { return auto; },
    init() { set(tier); },
    frame(dt) {
      if (!auto || tier === 'low' || !(dt > 0)) return;
      elapsed += dt; frames++;
      if (elapsed < windowSec) return;
      const avgMs = (elapsed / frames) * 1000;
      elapsed = 0; frames = 0;
      if (avgMs > aboveMs) set(ORDER[ORDER.indexOf(tier) + 1]); // one tier down, never up
    },
    setOverride(v) {
      saveOverride(v, storage); auto = v === 'auto'; elapsed = 0; frames = 0;
      if (auto) set(tier); else set(v); // switching back to auto keeps the current tier (no step up)
    },
  };
}

// Frame limiter helper: returns true if this rAF should render.
export function createLimiter() {
  let last = -Infinity;
  return (tMs, fpsCap) => {
    if (!fpsCap) return true;
    const min = 1000 / fpsCap - 1;
    if (tMs - last < min) return false;
    last = tMs; return true;
  };
}
