// Headless-safe test scene definition (no three.js). Shared by browser and tests.
import { createPhysicsWorld } from '../physics/world.js';
import { createPlayer } from '../player/controller.js';
import { mulberry32 } from '../core/rng.js';

export const WALL = { x: 4, halfThickness: 0.05, halfHeight: 1.5, halfDepth: 4 };

export function buildScene({ seed = 1, player = {}, boxes: withBoxes = true } = {}) {
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
  return { phys, player: p, statics, boxes };
}

// One deterministic fixed step: input applied, then world stepped.
export function stepScene(scene, input, dt) {
  scene.player.update(input, dt);
  scene.phys.step();
}
