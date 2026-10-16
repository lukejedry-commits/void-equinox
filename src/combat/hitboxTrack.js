// Hitbox tracks: authored per-step keyframes sampled by an integer step timer.
// Gameplay hitboxes come only from this data -- skeleton bones are visual only, and
// no three.js animation/mixer math is involved, so sampling is deterministic.
//
// A track: { lengthSteps, keys: [{ stepIndex, shape, offset:{x,y,z}, active }] }
// Keys are step-held (no interpolation): the key in effect at step s is the last key
// with stepIndex <= s. Before the first key / at or after lengthSteps -> inactive.
// TODO(Mechanics): shapes/timings below are placeholders.

export function defineTrack({ lengthSteps, keys }) {
  if (!Number.isInteger(lengthSteps) || lengthSteps <= 0) throw new Error('lengthSteps must be a positive integer');
  const sorted = keys.map((k) => {
    if (!Number.isInteger(k.stepIndex) || k.stepIndex < 0) throw new Error(`stepIndex must be a non-negative integer: ${k.stepIndex}`);
    return Object.freeze({ stepIndex: k.stepIndex, shape: Object.freeze({ ...k.shape }),
      offset: Object.freeze({ x: 0, y: 0, z: 0, ...k.offset }), active: !!k.active });
  }).sort((a, b) => a.stepIndex - b.stepIndex);
  for (let i = 1; i < sorted.length; i++) if (sorted[i].stepIndex === sorted[i - 1].stepIndex) throw new Error(`duplicate stepIndex ${sorted[i].stepIndex}`);
  return Object.freeze({ lengthSteps, keys: Object.freeze(sorted) });
}

const INACTIVE = Object.freeze({ active: false, shape: null, offset: null, stepIndex: -1 });

// step: integer steps since the attack started.
export function sampleTrack(track, step) {
  if (!Number.isInteger(step)) throw new Error(`step must be an integer, got ${step}`);
  if (step < 0 || step >= track.lengthSteps) return INACTIVE;
  let lo = 0, hi = track.keys.length - 1, found = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (track.keys[mid].stepIndex <= step) { found = mid; lo = mid + 1; } else hi = mid - 1; }
  return found < 0 ? INACTIVE : track.keys[found];
}

// Per-attack runtime: integer timer advanced once per fixed step.
export function createTrackPlayer(track) {
  let step = -1;
  return {
    start() { step = 0; },
    // Returns the sample for the current step, then advances the timer.
    tick() { if (step < 0) return INACTIVE; const s = sampleTrack(track, step); step++; if (step >= track.lengthSteps) step = -1; return s; },
    get step() { return step; },
  };
}

// Placeholder example attack. TODO(Mechanics)
export const LIGHT_SLASH = defineTrack({
  lengthSteps: 24,
  keys: [
    { stepIndex: 0, shape: { type: 'sphere', radius: 0.3 }, offset: { x: 0, y: 1, z: -0.6 }, active: false }, // windup
    { stepIndex: 8, shape: { type: 'sphere', radius: 0.45 }, offset: { x: 0.3, y: 1, z: -0.9 }, active: true },
    { stepIndex: 11, shape: { type: 'capsule', radius: 0.35, halfHeight: 0.4 }, offset: { x: -0.2, y: 1, z: -1.0 }, active: true },
    { stepIndex: 14, shape: { type: 'sphere', radius: 0.3 }, offset: { x: 0, y: 1, z: -0.6 }, active: false }, // recovery
  ],
});
