import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { initRapier } from './physics/world.js';
import { createSync } from './physics/sync.js';
import { buildScene, stepScene } from './game/scene.js';
import { createLoop } from './core/loop.js';
import { createInput } from './core/input.js';
import { createQuality, createLimiter } from './render/quality.js';
import { createPerf } from './debug/perf.js';
import { createTPSCamera } from './render/camera.js';
import { addRim } from './render/rim.js';
import './style.css';

await initRapier();
const scene = buildScene({ seed: 1337, dummy: true });

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.getElementById('app').appendChild(renderer.domElement);

const three = new THREE.Scene();
three.background = new THREE.Color(0x2a1a14);
three.fog = new THREE.Fog(0x2a1a14, 18, 50);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);

// Autumn-ish placeholder lighting
three.add(new THREE.HemisphereLight(0xffc89a, 0x3a2418, 0.6));
const sun = new THREE.DirectionalLight(0xffa860, 2.2);
sun.position.set(-8, 12, 6); sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15 });
three.add(sun);
const ember = new THREE.PointLight(0xff5a1f, 20, 12);
ember.position.set(2, 2, -2); three.add(ember);

const sync = createSync(scene.phys);
const mats = {
  ground: new THREE.MeshStandardMaterial({ color: 0x6b3f22, roughness: 1 }),
  wall: new THREE.MeshStandardMaterial({ color: 0x8a8f99, roughness: 0.6 }),
  box: new THREE.MeshStandardMaterial({ color: 0xc8641e, roughness: 0.8 }),
  player: new THREE.MeshStandardMaterial({ color: 0xe8d6b0, emissive: 0x331100 }),
};
for (const s of [...scene.statics.map((o) => ({ ...o, m: mats[o.kind] })), ...scene.boxes.map((o) => ({ ...o, m: mats.box }))]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...s.size), s.m);
  mesh.castShadow = mesh.receiveShadow = true; three.add(mesh); sync.link(s.id, mesh);
}
const pm = new THREE.Group();
const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.1, 6, 12), mats.player);
body.castShadow = true; pm.add(body);
const nose = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.3), mats.wall);
nose.position.set(0, 0.4, -0.35); pm.add(nose);
three.add(pm); sync.link(scene.player.id, pm);

// Lock-on dummy: static capsule; locked state shown as a faint cold-white fresnel rim.
const dummyMat = new THREE.MeshStandardMaterial({ color: 0x5a5550, roughness: 0.9 });
const dummyRim = addRim(dummyMat, { color: 0xa8c8ff, strength: 0, power: 2.5 });
const dummyMesh = new THREE.Mesh(new THREE.CapsuleGeometry(scene.dummy.radius, scene.dummy.halfHeight * 2, 6, 12), dummyMat);
dummyMesh.castShadow = dummyMesh.receiveShadow = true; three.add(dummyMesh); sync.link(scene.dummy.id, dummyMesh);
const tps = createTPSCamera({ camera, phys: scene.phys, targets: [{
  position: () => ({ x: scene.dummy.x, y: scene.dummy.y, z: scene.dummy.z }),
  onLock: (on) => { dummyRim.rimStrength.value = on ? 0.9 : 0; },
}], onFade: (o) => window.__onCamFade?.(o) });
tps.attach(renderer.domElement);
window.__tps = tps;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(three, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.4, 0.85);
composer.addPass(bloom); composer.addPass(new OutputPass());

let preset;
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio, preset.pixelRatioCap) * preset.resScale);
  renderer.setSize(w, h); composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h);
  if (preset.bloom) bloom.resolution.set(w * preset.bloomRes, h * preset.bloomRes);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
const quality = createQuality({ onChange: (p) => {
  preset = p;
  sun.shadow.mapSize.set(p.shadowMapSize, p.shadowMapSize); sun.shadow.map?.dispose(); sun.shadow.map = null;
  bloom.enabled = p.bloom; resize();
  document.getElementById('quality').value = quality.auto ? 'auto' : quality.tier;
} });
const sel = document.getElementById('quality');
sel.addEventListener('change', () => quality.setOverride(sel.value));
quality.init();
addEventListener('resize', resize);

const input = createInput({ getYaw: () => tps.yaw }); input.attach(window);
const perf = createPerf();
const loop = createLoop({ step: (dt, tick) => stepScene(scene, input.sample(tick), dt) });
const limiter = createLimiter();
let lastT = null;

function frame(tMs) {
  requestAnimationFrame(frame);
  if (!limiter(tMs, preset.fpsCap)) return;
  const dt = lastT === null ? 0 : (tMs - lastT) / 1000; lastT = tMs;
  const alpha = loop.advance(dt);
  sync.apply(alpha); // the only place mesh transforms are written
  tps.update(dt, pm.position); // render-side only; sim sees yaw via recorded input.yawQ
  renderer.info.reset(); renderer.info.autoReset = false;
  preset.bloom ? composer.render() : renderer.render(three, camera);
  quality.frame(dt);
  perf.update({ frameMs: dt * 1000, physicsMs: loop.stats.physicsMs, steps: loop.stats.stepsThisFrame, renderer, tier: preset.name, auto: quality.auto });
}
requestAnimationFrame(frame);
window.__ready = true;
