// Attack tells: fresnel rim emissive on the attacker. RENDER-SIDE ONLY (driven by a clock
// and a scheduled hit time; never feeds back into the sim).
//   normal:      cold #a8c8ff
//   unblockable: #ff9a40 ramping to #ffffff across the flare
// Flare peaks at the hit; it starts TELL.lead s before (TELL.leadSilence during silence).
import * as THREE from 'three';
import { addRim } from './rim.js';

export const TELL = {
  normal: 0xa8c8ff, unblockable: 0xff9a40, unblockableEnd: 0xffffff,
  lead: 0.4, leadSilence: 0.6, peak: 4.0, base: 0.35, power: 2.0, tail: 0.12,
};

export function createTell(material, { tuning = TELL } = {}) {
  const u = addRim(material, { color: tuning.normal, strength: 0, power: tuning.power, id: 'Tell', base: tuning.base });
  const cA = new THREE.Color(), cB = new THREE.Color(tuning.unblockableEnd), cN = new THREE.Color(tuning.normal), cU = new THREE.Color(tuning.unblockable);
  let hitAt = null, kind = 'normal', lead = tuning.lead, hold = false;
  const api = {
    uniforms: u,
    // Schedule a tell for an attack landing at `hitTime` (seconds, same clock as update()).
    schedule(hitTime, { unblockable = false, silence = false } = {}) {
      hitAt = hitTime; kind = unblockable ? 'unblockable' : 'normal'; lead = silence ? tuning.leadSilence : tuning.lead; hold = false;
    },
    leadFor: ({ silence = false } = {}) => (silence ? tuning.leadSilence : tuning.lead),
    // Pin the flare at peak (debug / readability check).
    hold(on = true, opts = {}) { hold = on; kind = opts.unblockable ? 'unblockable' : 'normal'; if (!on) u.rimStrength.value = 0; },
    // Returns flare 0..1.
    // gain: optional multiplier (e.g. presence compensation so tells survive the exposure lift).
    update(now, gain = 1) {
      let f = 0, ramp = 1;
      if (hold) f = 1;
      else if (hitAt !== null) {
        const dt = now - hitAt; // negative before the hit
        if (dt >= -lead && dt <= 0) { ramp = (dt + lead) / lead; f = ramp * ramp; }
        else if (dt > 0 && dt < tuning.tail) f = 1 - dt / tuning.tail;
        else if (dt >= tuning.tail) hitAt = null;
      }
      if (kind === 'unblockable') u.rimColor.value.copy(cA.copy(cU).lerp(cB, Math.min(1, ramp)));
      else u.rimColor.value.copy(cN);
      u.rimStrength.value = tuning.peak * f * gain;
      return f;
    },
    get active() { return hold || hitAt !== null; },
  };
  return api;
}
