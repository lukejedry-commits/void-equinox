// Fixed 60 Hz physics with accumulator; render interpolation alpha.
export const FIXED_DT = 1 / 60;
export const MAX_CATCHUP_STEPS = 4;

export function createLoop({ step, render, dt = FIXED_DT, maxSteps = MAX_CATCHUP_STEPS, now = () => performance.now() / 1000 }) {
  let acc = 0;
  let last = null;
  const stats = { stepsThisFrame: 0, physicsMs: 0, droppedTime: 0, tick: 0 };

  // Advance by a frame delta (seconds). Usable headless.
  function advance(frameDt) {
    acc += Math.min(frameDt, 0.25);
    let steps = 0;
    const t0 = now();
    while (acc >= dt && steps < maxSteps) {
      step(dt, stats.tick++);
      acc -= dt;
      steps++;
    }
    if (acc >= dt) { // drop backlog (spiral-of-death guard)
      stats.droppedTime += acc - (acc % dt);
      acc = acc % dt;
    }
    stats.physicsMs = (now() - t0) * 1000;
    stats.stepsThisFrame = steps;
    const alpha = acc / dt;
    render?.(alpha, stats);
    return alpha;
  }

  function frame(tSec) {
    if (last === null) last = tSec;
    const fdt = tSec - last;
    last = tSec;
    advance(fdt);
  }

  return { advance, frame, stats, reset() { acc = 0; last = null; } };
}
