// Rapier init, world step, body registry.
import RAPIER from '@dimforge/rapier3d-deterministic-compat';

let ready = null;
export function initRapier() { return (ready ??= RAPIER.init().then(() => RAPIER)); }
export { RAPIER };

export function createPhysicsWorld(gravity = { x: 0, y: -9.81, z: 0 }, dt = 1 / 60) {
  const world = new RAPIER.World(gravity);
  world.timestep = dt;
  const bodies = new Map(); // id -> { body, collider, prev:{p,q}, curr:{p,q} }
  let nextId = 1;

  const snap = (b) => {
    const t = b.translation(), r = b.rotation();
    return { p: { x: t.x, y: t.y, z: t.z }, q: { x: r.x, y: r.y, z: r.z, w: r.w } };
  };

  function add(bodyDesc, colliderDesc, tag = '') {
    const body = world.createRigidBody(bodyDesc);
    const collider = world.createCollider(colliderDesc, body);
    const id = nextId++;
    const s = snap(body);
    bodies.set(id, { id, tag, body, collider, prev: s, curr: snap(body) });
    return id;
  }

  function step() {
    for (const e of bodies.values()) e.prev = e.curr;
    world.step();
    for (const e of bodies.values()) e.curr = snap(e.body);
  }

  return { RAPIER, world, bodies, add, get: (id) => bodies.get(id), step, free: () => world.free() };
}
