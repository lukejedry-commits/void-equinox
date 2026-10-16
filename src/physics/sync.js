// One-way body -> mesh sync with interpolation. Game logic never writes mesh transforms.
import * as THREE from 'three';
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();

export function createSync(phys) {
  const links = new Map(); // bodyId -> Object3D
  return {
    link(id, mesh) { mesh.matrixAutoUpdate = true; links.set(id, mesh); },
    apply(alpha) {
      for (const [id, mesh] of links) {
        const e = phys.get(id); if (!e) continue;
        const a = e.prev, b = e.curr;
        mesh.position.set(
          a.p.x + (b.p.x - a.p.x) * alpha,
          a.p.y + (b.p.y - a.p.y) * alpha,
          a.p.z + (b.p.z - a.p.z) * alpha);
        qa.set(a.q.x, a.q.y, a.q.z, a.q.w); qb.set(b.q.x, b.q.y, b.q.z, b.q.w);
        mesh.quaternion.slerpQuaternions(qa, qb, alpha);
      }
    },
  };
}
