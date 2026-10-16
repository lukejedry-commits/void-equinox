// Draw-call batching for the test scene. RENDER-SIDE ONLY.
// - static colliders (ground, walls) sharing a material are merged into one mesh;
// - dynamic boxes become one InstancedMesh. Physics sync still writes plain Object3D
//   proxies (never added to the scene); we copy their matrices into the instance buffer.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function buildBatches({ statics, boxes, sync, phys, material }) {
  const parts = [];
  for (const s of statics) {
    const e = phys.get(s.id), p = e.curr.p, q = e.curr.q;
    const g = new THREE.BoxGeometry(...s.size);
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y, p.z), new THREE.Quaternion(q.x, q.y, q.z, q.w), new THREE.Vector3(1, 1, 1)));
    parts.push(g);
  }
  const staticMesh = new THREE.Mesh(mergeGeometries(parts), material);
  staticMesh.name = 'static-merged'; staticMesh.receiveShadow = staticMesh.castShadow = true;
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const inst = new THREE.InstancedMesh(unit, material, Math.max(1, boxes.length));
  inst.name = 'boxes-instanced'; inst.castShadow = inst.receiveShadow = true;
  inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const proxies = boxes.map((b) => { const o = new THREE.Object3D(); o.userData.size = b.size; sync.link(b.id, o); return o; });
  const m = new THREE.Matrix4(), sc = new THREE.Vector3();
  function update() {
    proxies.forEach((o, i) => { sc.fromArray(o.userData.size); m.compose(o.position, o.quaternion, sc); inst.setMatrixAt(i, m); });
    inst.count = proxies.length; inst.instanceMatrix.needsUpdate = true; inst.computeBoundingSphere();
  }
  update();
  return { staticMesh, inst, update };
}
