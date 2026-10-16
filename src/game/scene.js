// Headless-safe test scene definition (no three.js). Shared by browser and tests.
import { createPhysicsWorld } from '../physics/world.js';
import { createPlayer } from '../player/controller.js';
import { mulberry32 } from '../core/rng.js';

export const WALL = { x: 4, halfThickness: 0.05, halfHeight: 1.5, halfDepth: 4 };

// Lock-on dummy target (static capsule). Opt-in so existing test scenes are unchanged.
export const DUMMY = { x: 2.4, z: -3.2, radius: 0.35, halfHeight: 0.55 }; // TODO(Mechanics)

export function buildScene({ seed = 1, player = {}, boxes: withBoxes = true, dummy: withDummy = false } = {}) {
  const phys = createPhysicsWorld();
  const { RAPIER } = phys;
  const rng = mulberry32(seed);
  const statics = [];
  statics.push({ id: phys.add(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0),
    RAPIER.ColliderDesc.cuboid(25, 0.5, 25), 'ground'), size: [50, 1, 50], kind: 'ground' });
  statics.push({ id: phys.add(RAPIER.RigidBodyDesc.fixed().setTranslation(WALL.x, WALL.halfHeight, 0),
    RAPIER.ColliderDesc.cuboid(WALL.halfThickness, WALL.halfHeight, WALL.halfDepth), 'wall'),
    size: [WALL.halfThickness * 2, WALL.halfHeight * 2, WALL.halfDepth * 2], kind: 'wall' });
  const boxes = [];
  for (let i = 0; i < (withBoxes ? 5 : 0); i++) {
    const s = rng.range(0.3, 0.7);
    const id = phys.add(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(rng.range(-6, 0), 0.5 + i * 1.2, rng.range(-5, 5)),
      RAPIER.ColliderDesc.cuboid(s, s, s).setDensity(1), 'box');
    boxes.push({ id, size: [s * 2, s * 2, s * 2] });
  }
  const p = createPlayer(phys, { x: 0, y: 1.0, z: 0, ...player });
  let dummy = null;
  if (withDummy) {
    const y = DUMMY.halfHeight + DUMMY.radius;
    dummy = { id: phys.add(RAPIER.RigidBodyDesc.fixed().setTranslation(DUMMY.x, y, DUMMY.z),
      RAPIER.ColliderDesc.capsule(DUMMY.halfHeight, DUMMY.radius), 'dummy'), ...DUMMY, y };
  }
  // Sim-side environment flags (e.g. the fire light being lit drives stamina regen).
  const env = { fireLit: false };
  return { phys, player: p, statics, boxes, dummy, env };
}

// One deterministic fixed step: input applied, then world stepped.
export function stepScene(scene, input, dt) {
  scene.player.update(input, dt, scene.env);
  scene.phys.step();
}

// Lighting zone trigger volumes (pure data; consumed render-side only by
// render/lighting.js createZoneTriggers). AABB min/max in metres. Not added to physics,
// so they cannot affect sim determinism.
export const LIGHT_ZONES = [
  { id: 'act1-arena', profile: 'act1_arena', min: [-25, -5, 9], max: [25, 10, 25] },
  { id: 'act2-boss', profile: 'act2_boss', min: [-25, -5, -25], max: [-14, 10, -12] },
  { id: 'act2', profile: 'act2', min: [-25, -5, -25], max: [-8, 10, 9] },
  { id: 'act3-door', profile: 'act3', min: [-8, -5, -25], max: [25, 10, -10] },
  { id: 'act1', profile: 'act1', min: [-8, -5, -10], max: [25, 10, 9] },
];
