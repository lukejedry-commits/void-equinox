// Low / Medium / High presets with auto-detect and persisted override.
export const PRESETS = {
  low:    { name: 'Low',    fpsCap: 30, resScale: 0.75, pixelRatioCap: 1.5, shadowMapSize: 1024, dirLights: 1, pointLights: 1, bloom: false, bloomRes: 0,    particleCap: 2000 },
  medium: { name: 'Medium', fpsCap: 60, resScale: 0.75, pixelRatioCap: 2,   shadowMapSize: 2048, dirLights: 1, pointLights: 2, bloom: true,  bloomRes: 0.25, particleCap: 5000 },
  high:   { name: 'High',   fpsCap: 0,  resScale: 1.0,  pixelRatioCap: 2,   shadowMapSize: 4096, dirLights: 1, pointLights: 4, bloom: true,  bloomRes: 0.5,  particleCap: 20000 },
};
const KEY = 'voidEquinox.quality'; // 'auto' | 'low' | 'medium' | 'high'

export function loadOverride(storage = globalThis.localStorage) {
  try { return storage?.getItem(KEY) || 'auto'; } catch { return 'auto'; }
}
export function saveOverride(v, storage = globalThis.localStorage) {
  try { storage?.setItem(KEY, v); } catch { /* ignore */ }
}

// Auto-detect: start Medium, sample fps for `windowSec`, then drop/raise once.
export function createQuality({ onChange, windowSec = 4, lowBelow = 45, highAbove = 58 } = {}) {
  const override = loadOverride();
  let tier = override === 'auto' ? 'medium' : override;
  let auto = override === 'auto';
  let elapsed = 0, frames = 0, decided = !auto;
  const set = (t) => { tier = t; onChange?.(PRESETS[t], t); };
  return {
    get tier() { return tier; }, get preset() { return PRESETS[tier]; }, get auto() { return auto; },
    init() { set(tier); },
    frame(dt) {
      if (decided) return;
      elapsed += dt; frames++;
      if (elapsed < windowSec) return;
      const fps = frames / elapsed; decided = true;
      if (fps < lowBelow) set('low'); else if (fps >= highAbove) set('high');
    },
    setOverride(v) {
      saveOverride(v); auto = v === 'auto';
      if (auto) { decided = false; elapsed = 0; frames = 0; set('medium'); } else { decided = true; set(v); }
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
