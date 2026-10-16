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

// Signed-distance penetration of the player capsule into scene colliders, from
// Rapier's exact shape-vs-shape contact query (distance < 0 == penetration).
// Returns the max depth (>= 0) into STATIC (fixed) colliders and into DYNAMIC ones.
export function penetration(scene) {
  const pc = scene.phys.get(scene.player.id).collider;
  let stat = 0, dyn = 0;
  for (const e of scene.phys.bodies.values()) {
    if (e.id === scene.player.id) continue;
    const c = pc.contactCollider(e.collider, 0);
    if (!c || c.distance >= 0) continue;
    const d = -c.distance;
    if (e.body.isFixed()) stat = Math.max(stat, d); else dyn = Math.max(dyn, d);
  }
  return { stat, dyn };
}
