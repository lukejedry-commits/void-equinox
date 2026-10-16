// Act-specific render props for the test scene (placeholders). RENDER-SIDE ONLY: no
// colliders, no sim reads/writes. Everything here is driven by lighting weights.
import * as THREE from 'three';
import { FIRE } from './lighting.js';
import { addRim, chainCompile } from './rim.js';

export const MOTE_COLOR = 0xfff2c8;   // angelic motes (Meridius). Reserved: puzzles may not use it.
export const SMOKE_COLOR = 0x2a2420;  // -ius smoke
export const EMBER = 0xff6a20;
export const PUZZLE_EMISSIVE = 0xff8a3a; // ember orange (fire-revealed); distinct from angelic white-gold and mote #fff2c8
export const DECAY = { center: [0.9, -1.7], radius: 1.1, band: 0.3, sat: 0.25, value: 0.7, edge: 0x4a3410 };
export const LAYOUT = {
  fire: [-1.8, 0.35, -2.6], landmarks: [[-0.4, -3.6], [-6.5, -4.5]], // second one is outside fire distance on purpose
  door: [0, -9], motes: [1.2, -5], smoke: [-4, -6],
};

// Readability rule (3): puzzle emissives must never use the angelic mote colour.
export function assertPuzzleEmissive(color) {
  const hex = new THREE.Color(color).getHex();
  if (hex === MOTE_COLOR) throw new Error('puzzle emissive may not use mote colour #fff2c8');
  return hex;
}

const hash = (i) => { const x = Math.sin(i * 91.7 + 13.3) * 43758.5453; return x - Math.floor(x); };

function softDot() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

function points(n, color, { size, additive, opacity, seed, spread, h }) {
  const geo = new THREE.BufferGeometry(), pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) pos.set([(hash(seed + i) - 0.5) * spread, hash(seed + i * 3) * h, (hash(seed + i * 7) - 0.5) * spread], i * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color, size, map: softDot(), transparent: true, opacity, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true });
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, h / 2, 0), Math.hypot(spread, h) * 0.75 + 1); // covers drift; enables frustum culling
  return new THREE.Points(geo, mat);
}

// Ground decay decal: patches the ground material (25% sat, 70% value, dark-ochre edge band).
export function addDecayToGround(material) {
  const u = { uDecayOn: { value: 0 }, uDecayC: { value: new THREE.Vector2(...DECAY.center) }, uDecayR: { value: DECAY.radius },
    uDecayBand: { value: DECAY.band }, uDecayEdge: { value: new THREE.Color(DECAY.edge) } };
  chainCompile(material, 'decay', (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDecayW;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec4 w = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          w = instanceMatrix * w;
        #endif
          vDecayW = (modelMatrix * w).xyz; }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vDecayW; uniform float uDecayOn; uniform vec2 uDecayC; uniform float uDecayR; uniform float uDecayBand; uniform vec3 uDecayEdge;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (vDecayW.y < 0.02) {
          float d = distance(vDecayW.xz, uDecayC);
          float inside = 1.0 - smoothstep(uDecayR - 0.02, uDecayR + 0.02, d);
          float band = smoothstep(uDecayR - 0.04, uDecayR, d) * (1.0 - smoothstep(uDecayR + uDecayBand - 0.04, uDecayR + uDecayBand, d));
          vec3 c = diffuseColor.rgb; float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          vec3 dec = mix(vec3(l), c, 0.25) * 0.7;   // 25% saturation, 70% value
          c = mix(c, dec, inside);
          c = mix(c, uDecayEdge, band);
          diffuseColor.rgb = mix(diffuseColor.rgb, c, uDecayOn);
        }`);
  });
  return u;
}

export function createProps({ scene, preset }) {
  const root = new THREE.Group(); root.name = 'act-props'; scene.add(root);
  const cap = (n) => Math.max(0, Math.min(n, Math.floor(preset().particleCap * 0.08)));

  // Act 2 fire: brazier + the single fire point light.
  const fire = new THREE.PointLight(FIRE.color, FIRE.intensity, FIRE.distance, FIRE.decay);
  fire.position.set(...LAYOUT.fire); fire.name = 'fire-light'; root.add(fire);
  const coalMat = new THREE.MeshStandardMaterial({ color: 0x1a0d06, emissive: EMBER, emissiveIntensity: 0 });
  const coal = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.3, 8), coalMat); coal.position.set(LAYOUT.fire[0], 0.15, LAYOUT.fire[2]); coal.userData.dc = 'props act2: brazier'; root.add(coal);
  // Puzzle landmarks: emissive only within the fire light's distance. Emissive is never clamped under presence.
  const landmarks = LAYOUT.landmarks.map(([x, z]) => {
    const m = new THREE.MeshStandardMaterial({ color: 0x3c3c3c, roughness: 0.9, emissive: assertPuzzleEmissive(PUZZLE_EMISSIVE), emissiveIntensity: 0 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.1, 0.35), m); mesh.position.set(x, 0.55, z); mesh.userData.dc = 'props act2: puzzle landmarks'; mesh.receiveShadow = true; root.add(mesh); // no shadow casting (draw calls)
    const inRange = Math.hypot(x - LAYOUT.fire[0], z - LAYOUT.fire[2]) <= FIRE.distance;
    return { mesh, m, inRange };
  });

  // Act 3 winter door + frost leaf mound.
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x6e7076, roughness: 0.9 });
  const door = new THREE.Group(); door.position.set(LAYOUT.door[0], 0, LAYOUT.door[1]); door.userData.dc = 'props act3: winter door'; root.add(door);
  for (const [w, h, x, y] of [[0.4, 3.2, -1.1, 1.6], [0.4, 3.2, 1.1, 1.6], [2.6, 0.4, 0, 3.3]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.4), doorMat); b.position.set(x, y, 0); b.castShadow = b.receiveShadow = true; door.add(b);
  }
  // (Act 3 ambient drifting ember/leaf motes removed per Graphics review; the stand-in's own
  // embers and the frost mound stay.)
  // Leaf mound at the door: zero wind, white fresnel frost rim 0.4.
  const moundMat = new THREE.MeshStandardMaterial({ color: 0x6a4424, roughness: 1, side: THREE.DoubleSide });
  const frost = addRim(moundMat, { color: 0xffffff, strength: 0, power: 2, id: 'Frost' });
  const nMound = 60, mound = new THREE.InstancedMesh(new THREE.CircleGeometry(0.09, 5), moundMat, nMound);
  const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < nMound; i++) {
    const a = hash(i) * Math.PI * 2, r = Math.sqrt(hash(i + 40)) * 0.8;
    e.set(-Math.PI / 2 + (hash(i + 5) - 0.5) * 0.9, hash(i + 9) * 6, 0); q.setFromEuler(e);
    mm.compose(new THREE.Vector3(Math.cos(a) * r, 0.02 + (0.8 - r) * 0.18 * hash(i + 2), Math.sin(a) * r), q, new THREE.Vector3(1, 1, 1)); mound.setMatrixAt(i, mm);
  }
  mound.position.set(LAYOUT.door[0], 0, LAYOUT.door[1] + 0.6); mound.receiveShadow = true; mound.userData.dc = 'props act3: frost mound'; root.add(mound);

  // Meridius motes (additive, rising) and -ius smoke (alpha, sinking).
  const motes = points(cap(160), MOTE_COLOR, { size: 0.07, additive: true, opacity: 0.0, seed: 3, spread: 3, h: 3 });
  motes.position.set(LAYOUT.motes[0], 0, LAYOUT.motes[1]); motes.userData.dc = 'particles: Meridius motes'; root.add(motes);
  const smoke = points(cap(120), SMOKE_COLOR, { size: 0.6, additive: false, opacity: 0.0, seed: 7, spread: 3, h: 2.5 });
  smoke.position.set(LAYOUT.smoke[0], 0, LAYOUT.smoke[1]); smoke.userData.dc = 'particles: -ius smoke'; root.add(smoke);

  const doorW = new THREE.Vector3(LAYOUT.door[0], 1, LAYOUT.door[1]);
  let time = 0;
  function drift(pts, dy, h, windFn) {
    const a = pts.geometry.attributes.position, n = a.count;
    for (let i = 0; i < n; i++) {
      let x = a.getX(i), y = a.getY(i), z = a.getZ(i);
      const w = windFn ? windFn(x + pts.position.x, z + pts.position.z) : 0;
      x += w * 0.9 * dy.dt; z += w * 0.3 * Math.sin(time + i) * dy.dt;
      y += dy.v * dy.dt + (windFn ? -0.25 * dy.dt * (0.3 + w) : 0);
      if (y > h) y = 0; if (y < 0) y = h; if (x > 7) x = -7;
      a.setXYZ(i, x, y, z);
    }
    a.needsUpdate = true;
  }
  return {
    root, fire, landmarks, mound, motes, smoke, frost,
    // windAt: leaf wind factor (1 far away -> 0 near the door).
    windAt(x, z) { const d = Math.hypot(x - doorW.x, z - doorW.z); return THREE.MathUtils.smoothstep(d, 1.5, 6); },
    update(dt, w) {
      time += dt;
      coalMat.emissiveIntensity = 2.5 * w.fire; coal.visible = w.fire > 0.01;
      for (const l of landmarks) { l.m.emissiveIntensity = l.inRange ? 0.9 * w.fire : 0; l.mesh.visible = w.fire > 0.01; } // Act 2 props: skipped elsewhere
      door.visible = mound.visible = w.winter > 0.01;
      frost.rimStrength.value = 0.4 * w.winter;
      // Skip particle systems at zero opacity (frustum culling handles out-of-view).
      motes.material.opacity = 0.15 + 0.75 * w.presence; motes.visible = motes.material.opacity > 0.001;
      smoke.material.opacity = 0.35 * w.fire; smoke.visible = smoke.material.opacity > 0.001;
      if (motes.visible) drift(motes, { v: 0.35, dt }, 3);
      if (smoke.visible) drift(smoke, { v: -0.25, dt }, 2.5);
    },
  };
}
