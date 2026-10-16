import { initRapier } from '../src/physics/world.js';
export { initRapier };
const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
export const bits = (v) => { f64[0] = v; return `${u32[1].toString(16)}:${u32[0].toString(16)}`; };
export function snapshot(scene) {
  const out = [];
  for (const e of scene.phys.bodies.values()) {
    const t = e.body.translation(), r = e.body.rotation();
    out.push([t.x, t.y, t.z, r.x, r.y, r.z, r.w].map(bits).join(','));
  }
  return out.join('|');
}
