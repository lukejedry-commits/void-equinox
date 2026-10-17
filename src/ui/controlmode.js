// Control mode: 'pc' | 'phone' | 'tablet'. The touch UI (and its move stick) only runs in
// Phone/Tablet mode. Default: any fine pointer (mouse / trackpad) present -> PC, even on a
// touchscreen laptop; touch-only devices -> Phone (shorter side < 600 CSS px) or Tablet.
export const CONTROL_MODES = ['pc', 'phone', 'tablet'];
const KEY = 'voidEquinox.controls';

export function defaultControlMode({ anyFine, touch, minSidePx }) {
  if (anyFine || !touch) return 'pc';
  return minSidePx < 600 ? 'phone' : 'tablet';
}
export function detectControlMode(w = globalThis) {
  const mm = (q) => !!w.matchMedia?.(q).matches;
  return defaultControlMode({ anyFine: mm('(any-pointer: fine)'), touch: mm('(any-pointer: coarse)') || (w.navigator?.maxTouchPoints || 0) > 0, minSidePx: Math.min(w.innerWidth || 0, w.innerHeight || 0) });
}
export function loadControlMode(storage = globalThis.localStorage) {
  let v = null; try { v = storage?.getItem(KEY); } catch { /* ignore */ }
  return CONTROL_MODES.includes(v) ? v : null;
}
export function saveControlMode(v, storage = globalThis.localStorage) { try { storage?.setItem(KEY, v); } catch { /* ignore */ } }
export const usesTouchUI = (mode) => mode === 'phone' || mode === 'tablet';
// The move stick accepts only real touch contacts, and only in Phone/Tablet mode.
export const stickAccepts = (mode, pointerType) => usesTouchUI(mode) && pointerType === 'touch';
