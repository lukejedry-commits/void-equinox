import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { initRapier } from './physics/world.js';
import { createSync } from './physics/sync.js';
import { buildScene, stepScene, LIGHT_ZONES } from './game/scene.js';
import { createLoop } from './core/loop.js';
import { createInput } from './core/input.js';
import { createQuality, createLimiter } from './render/quality.js';
import { createPerf } from './debug/perf.js';
import { createDrawCallProbe } from './debug/drawcalls.js';
import { createTPSCamera } from './render/camera.js';
import { addRim } from './render/rim.js';
import { createStandin } from './render/standin.js';
import { buildBatches } from './render/batch.js';
import { createLighting, createZoneTriggers, PROFILES } from './render/lighting.js';
import { createTell } from './render/tells.js';
import { createProps, addDecayToGround } from './render/props.js';
import { measureReadability } from './render/readability.js';
import './style.css';

await initRapier();
const scene = buildScene({ seed: 1337, dummy: true });

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const three = new THREE.Scene();
three.background = new THREE.Color(0x2a1a14);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);

// Lighting: HemisphereLight fill + one shadowed DirectionalLight, driven by LightingProfiles.
const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 0.6); three.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.castShadow = true; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 0.5, far: 60 });
three.add(sun, sun.target);
let preset;
const props = createProps({ scene: three, preset: () => preset ?? { particleCap: 2000 } });
const params = new URLSearchParams(location.search);
const lighting = createLighting({ scene: three, renderer, sun, hemi, fire: props.fire, initial: PROFILES[params.get('act')] ? params.get('act') : 'act1' });

const sync = createSync(scene.phys);
// Neutral mid-grey test geometry so lighting profiles (not albedo) carry the colour.
// One shared material lets statics merge and boxes instance (draw-call batching).
const mats = { ground: new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.95 }) };
const decay = addDecayToGround(mats.ground);
// Batched: statics merged into one mesh, boxes instanced (see render/batch.js).
const batches = buildBatches({ statics: scene.statics, boxes: scene.boxes, sync, phys: scene.phys, material: mats.ground });
batches.staticMesh.userData.dc = 'main meshes: static merged (ground+wall)'; batches.inst.userData.dc = 'main meshes: boxes (instanced)';
three.add(batches.staticMesh, batches.inst);
const pm = new THREE.Group();
const standin = createStandin(); pm.add(standin.object); // visual only, follows synced capsule
window.__standin = standin;
three.add(pm); sync.link(scene.player.id, pm);

// Lock-on dummy: static capsule; locked state shown as a faint cold-white fresnel rim.
const dummyMat = new THREE.MeshStandardMaterial({ color: 0x5a5550, roughness: 0.9 });
const dummyRim = addRim(dummyMat, { color: 0xa8c8ff, strength: 0, power: 2.5 });
const tell = createTell(dummyMat); window.__tell = tell;
const dummyMesh = new THREE.Mesh(new THREE.CapsuleGeometry(scene.dummy.radius, scene.dummy.halfHeight * 2, 6, 12), dummyMat);
dummyMesh.userData.dc = 'main meshes: lock-on dummy'; dummyMesh.castShadow = dummyMesh.receiveShadow = true; three.add(dummyMesh); sync.link(scene.dummy.id, dummyMesh);
const tps = createTPSCamera({ camera, phys: scene.phys, targets: [{
  position: () => ({ x: scene.dummy.x, y: scene.dummy.y, z: scene.dummy.z }),
  onLock: (on) => { dummyRim.rimStrength.value = on ? 0.9 : 0; },
}], onFade: (o) => standin.setFade(o) });
tps.attach(renderer.domElement);
window.__tps = tps;
// ?shot: scripted framing for docs screenshots (render-side only).
if (params.has('shot')) { tps.setYaw(-0.5, 0.18); tps.toggleLock(); }
if (params.has('behind')) { tps.setYaw(0.35, 0.22); }
if (params.get('presence') === '1') lighting.setPresence(true, true);
if (params.has('tell')) tell.hold(true, { unblockable: params.get('tell') === 'unblockable' });
const zones = createZoneTriggers(LIGHT_ZONES, lighting);
let clock = 0;
// Debug keys: 1/2/3 act, 4 act1 arena, 5 act2 boss, P presence, T normal tell, Y unblockable tell (U: during silence).
const ACT_KEYS = { Digit1: 'act1', Digit2: 'act2', Digit3: 'act3', Digit4: 'act1_arena', Digit5: 'act2_boss' };
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (ACT_KEYS[e.code]) lighting.setProfile(ACT_KEYS[e.code]);
  else if (e.code === 'KeyP') lighting.setPresence(!lighting.presence.on);
  else if (e.code === 'KeyT') tell.schedule(clock + tell.leadFor());
  else if (e.code === 'KeyY') tell.schedule(clock + tell.leadFor(), { unblockable: true });
  else if (e.code === 'KeyU') tell.schedule(clock + tell.leadFor({ silence: true }), { unblockable: true, silence: true });
});
window.__lighting = lighting;

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(three, camera), outputPass = new OutputPass();
composer.addPass(renderPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.4, 0.85);
composer.addPass(bloom); composer.addPass(outputPass); composer.addPass(lighting.grade);
const drawProbe = createDrawCallProbe({ renderer, composer, passNames: new Map([[renderPass, 'main'], [bloom, 'bloom'], [outputPass, 'post: output (tone map)'], [lighting.grade, 'post: colour grade']]) });
lighting.patchScene();

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
  // Low allows a single point light: the act fire keeps it, the stand-in chest glow goes.
  standin.object.traverse((o) => { if (o.isPointLight) o.visible = p.pointLights > 1; });
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
const lastPos = new THREE.Vector3();

function frame(tMs) {
  requestAnimationFrame(frame);
  if (!limiter(tMs, preset.fpsCap)) return;
  const dt = lastT === null ? 0 : (tMs - lastT) / 1000; lastT = tMs;
  const alpha = loop.advance(dt);
  sync.apply(alpha); // the only place mesh transforms are written
  batches.update();
  const sp = dt > 0 ? Math.hypot(pm.position.x - lastPos.x, pm.position.z - lastPos.z) / dt : 0;
  lastPos.copy(pm.position);
  standin.update(dt, { speed: sp, dodging: scene.player.state.dodgeLeft > 0 });
  tps.update(dt, pm.position); // render-side only; sim sees yaw via recorded input.yawQ
  clock += dt;
  zones.update(pm.position); lighting.update(dt);
  const w = lighting.weights(); decay.uDecayOn.value = w.decay; props.update(dt, w); standin.setCloakRimMin(w.cloakRimMin); tell.update(clock, tellGain());
  renderFrame();
  window.__drawCalls = renderer.info.render.calls;
  quality.frame(dt);
  perf.update({ frameMs: dt * 1000, physicsMs: loop.stats.physicsMs, steps: loop.stats.stepsThisFrame, renderer, tier: preset.name, auto: quality.auto });
}
// Tells stay readable through the Meridius presence pulse (exposure 1.6, flat light).
const TELL_PRESENCE_GAIN = 2.0;
const tellGain = () => 1 + TELL_PRESENCE_GAIN * lighting.presence.value;
function renderFrame() {
  renderer.info.reset(); renderer.info.autoReset = false;
  composer.render(); // grading pass always runs; bloom pass toggled per preset
}
// Readability check (headless): see render/readability.js and scripts/readability-check.mjs.
window.__readability = (opts) => measureReadability({ renderer, standin, tellGain, bloom, scene: three, camera, lighting, tell, props, decay, renderFrame, ...opts });
window.__drawBreakdown = () => drawProbe.capture(renderFrame);
requestAnimationFrame(frame);
window.__ready = true;
