// LightingProfile system. RENDER-SIDE ONLY: never reads or writes the physics sim; the
// only input is the (interpolated, render-side) player position for zone triggers.
// One profile per act; switching blends over BLEND_SEC (colours lerped in linear space,
// which is THREE.Color's working space). A Meridius presence pulse rides on top.
import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export const BLEND_SEC = 3;
// Player brightness: +-0.25 stop of exposure, applied before tone mapping (multiplies
// toneMappingExposure, including the presence exposure, so presence keeps its relative lift).
export const BRIGHTNESS_STOPS = 0.25;
export const clampBrightness = (b) => Math.max(-BRIGHTNESS_STOPS, Math.min(BRIGHTNESS_STOPS, Number.isFinite(+b) ? +b : 0));
export const brightnessScale = (b) => Math.pow(2, clampBrightness(b));
export const PRESENCE = { rampIn: 1.5, release: 3, exposure: 1.6, saturation: 0.3, flat: 0xf4f1e6, fog: 0xc4c0b4, fogScale: 0.7, hemiInt: 0.7, keyInt: 0.1, albedoMax: 0.85 };
// PRESENCE.hemiInt: hemisphere fill target under presence; with ground colour -> flat this
// makes box undersides / contact areas flat and pale instead of the darkest pixels.
// Act 1 sky: vertical gradient background (horizon -> zenith), weighted by profile.skyGrad.
export const SKY_GRADIENT = { horizon: 0xe8b878, zenith: 0x9a6a48, rows: 64, zenithDeg: 20 }; // zenith colour reached at 20 deg elevation (top of the gameplay view)
export const HEIGHT_FOG_K = 0.15;           // density * exp(-height * 0.15)
export const FIRE = { color: 0xff8a3a, intensity: 3, distance: 4, decay: 2, fogScale: 0.3 };

// cloakRimMin: floor of the stand-in cloak fresnel rim (0.35 in Act 2 dusk, 0.15 elsewhere).
// sunDeg: elevation; weights act1/act2/act3 drive act-specific props (decal, fire, winter).
const P = (o) => ({ exposure: 1, sunAzDeg: -35, lift: [0, 0, 0], decay: 0, fire: 0, winter: 0, cloakRimMin: 0.15, skyGrad: 0, ...o });
export const PROFILES = {
  act1: P({ name: 'Act 1 - warm decline (Marcescius)', key: 0xffb070, keyInt: 2.2, sunDeg: 18, sky: 0xf2c58a, ground: 0x3a2414, hemiInt: 0.6,
    fog: 0xc9925a, fogDensity: 0.012, saturation: 1.1, lift: [0.045, 0.025, 0.008], decay: 1, skyGrad: 1 }),
  act1_arena: P({ name: 'Act 1 - arena', key: 0xd9a77a, keyInt: 2.2, sunDeg: 18, sky: 0xf2c58a, ground: 0x3a2414, hemiInt: 0.6,
    fog: 0xc9925a, fogDensity: 0.018, saturation: 0.6, lift: [0.045, 0.025, 0.008], decay: 1, skyGrad: 1 }),
  act2: P({ name: 'Act 2 - dusk (Tenebrius)', key: 0x8a7aa8, keyInt: 0.9, sunDeg: 4, sky: 0x4a4060, ground: 0x1a1418, hemiInt: 0.35,
    fog: 0x3b3346, fogDensity: 0.03, saturation: 0.9, fire: 1, cloakRimMin: 0.35 }),
  act2_boss: P({ name: 'Act 2 - boss', key: 0x8a7aa8, keyInt: 0.9, sunDeg: 4, sky: 0x4a4060, ground: 0x1a1418, hemiInt: 0.35,
    fog: 0x3b3346, fogDensity: 0.045, saturation: 0.9, fire: 1, cloakRimMin: 0.35 }),
  act3: P({ name: 'Act 3 - winter door', key: 0x9fb8d8, keyInt: 0.6, sunDeg: 10, sky: 0x2a3448, ground: 0x141820, hemiInt: 0.4,
    fog: 0x5a6678, fogDensity: 0.025, saturation: 0.85, winter: 1 }),
};
const COLORS = ['key', 'sky', 'ground', 'fog'];
const NUMS = ['keyInt', 'sunDeg', 'sunAzDeg', 'hemiInt', 'fogDensity', 'saturation', 'exposure', 'decay', 'fire', 'winter', 'cloakRimMin', 'skyGrad'];

function resolve(p) { // profile -> live state with THREE.Color (linear)
  const s = {}; for (const k of NUMS) s[k] = p[k]; for (const k of COLORS) s[k] = new THREE.Color(p[k]);
  s.lift = new THREE.Vector3(...p.lift); return s;
}
function lerpState(out, a, b, t) {
  for (const k of NUMS) out[k] = a[k] + (b[k] - a[k]) * t;
  for (const k of COLORS) out[k].copy(a[k]).lerp(b[k], t);
  out.lift.copy(a.lift).lerp(b.lift, t);
}
const clone = (s) => { const o = resolve(PROFILES.act1); lerpState(o, s, s, 0); return o; };

// --- Height fog + fire fog hole: global fog chunk override. Uniforms default to 0 on
// materials that were never patched, which degrades to plain FogExp2 (safe fallback).
let chunksPatched = false;
function patchFogChunks() {
  if (chunksPatched) return; chunksPatched = true;
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex += '\n#ifdef USE_FOG\nvarying vec3 vFogWorld;\n#endif\n';
  C.fog_vertex += `
#ifdef USE_FOG
  { vec4 fw = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    fw = instanceMatrix * fw;
  #endif
    vFogWorld = ( modelMatrix * fw ).xyz; }
#endif
`;
  C.fog_pars_fragment += `
#ifdef USE_FOG
varying vec3 vFogWorld;
uniform float uFogHeightK; uniform float uPresence; uniform vec3 uFirePos; uniform float uFireOn; uniform float uFireRadius; uniform float uFireFogScale;
#endif
`;
  // Presence albedo clamp: no surface reflects more than ALBEDO_MAX_PRESENCE under Meridius.
  C.color_fragment += `
#ifdef USE_FOG
  if ( uPresence > 0.0 ) diffuseColor.rgb = mix( diffuseColor.rgb, min( diffuseColor.rgb, vec3( ${PRESENCE.albedoMax.toFixed(3)} ) ), uPresence );
#endif
`;
  C.fog_fragment = `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogD = fogDensity * exp( - max( vFogWorld.y, 0.0 ) * uFogHeightK );
    float fireK = 1.0 - smoothstep( uFireRadius * 0.9, uFireRadius * 1.1, distance( vFogWorld, uFirePos ) );
    fogD *= mix( 1.0, uFireFogScale, fireK * uFireOn );
    float fogFactor = 1.0 - exp( - fogD * fogD * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
`;
}

// Grading pass (after OutputPass, i.e. on display-referred sRGB): saturation, warm shadow
// lift, presence flat tint.
export const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uSaturation: { value: 1 }, uLift: { value: new THREE.Vector3() },
    uFlat: { value: new THREE.Color(PRESENCE.flat) }, uPresence: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uSaturation; uniform vec3 uLift; uniform vec3 uFlat; uniform float uPresence; varying vec2 vUv;
    void main(){ vec4 t = texture2D(tDiffuse, vUv); vec3 c = t.rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSaturation);
      c += uLift * (1.0 - smoothstep(0.0, 0.45, l));
      c = mix(c, uFlat * (0.25 + 0.85 * l), uPresence * 0.45);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), t.a); }`,
};

export function createLighting({ scene, renderer, sun, hemi, fire = null, initial = 'act1' }) {
  patchFogChunks();
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMappingExposure = 1.0;
  const fog = new THREE.FogExp2(0x000000, 0.01); scene.fog = fog;
  if (!(scene.background instanceof THREE.Color)) scene.background = new THREE.Color();
  const grade = new ShaderPass(GradeShader);
  // Sky gradient: 1 x rows equirect DataTexture (v 0.5 = horizon, 1 = zenith; below the
  // horizon holds the horizon colour). Rebuilt only when its inputs change; scene.background
  // falls back to the plain fog Color when the gradient weight is 0.
  const bgColor = scene.background, skyRows = SKY_GRADIENT.rows, skyData = new Uint8Array(skyRows * 4);
  const skyTex = new THREE.DataTexture(skyData, 1, skyRows); skyTex.mapping = THREE.EquirectangularReflectionMapping;
  skyTex.colorSpace = THREE.SRGBColorSpace; skyTex.magFilter = skyTex.minFilter = THREE.LinearFilter;
  const skyH = new THREE.Color(SKY_GRADIENT.horizon), skyZ = new THREE.Color(SKY_GRADIENT.zenith), skyC = new THREE.Color(), skyRGB = { r: 0, g: 0, b: 0 };
  let skyKey = '';
  function applySky(fogColor, w, sat = 1) {
    if (w <= 0.001) { scene.background = bgColor; bgColor.copy(fogColor); return; }
    const key = `${w.toFixed(3)}|${fogColor.getHexString()}|${sat.toFixed(3)}`;
    if (key !== skyKey) {
      skyKey = key;
      for (let i = 0; i < skyRows; i++) {
        const v = (i + 0.5) / skyRows, t = Math.min(1, Math.max(0, (v - 0.5) * 180 / SKY_GRADIENT.zenithDeg)); // 0 horizon .. 1 zenith
        desat(skyC.copy(skyH).lerp(skyZ, t), sat).lerp(fogColor, 1 - w).getRGB(skyRGB, THREE.SRGBColorSpace);
        skyData.set([skyRGB.r * 255, skyRGB.g * 255, skyRGB.b * 255, 255], i * 4);
      }
      skyTex.needsUpdate = true;
    }
    scene.background = skyTex;
  }
  const uniforms = { // shared by reference into every patched material
    uFogHeightK: { value: HEIGHT_FOG_K }, uFirePos: { value: new THREE.Vector3() }, uFireOn: { value: 0 },
    uFireRadius: { value: FIRE.distance }, uFireFogScale: { value: FIRE.fogScale }, uPresence: { value: 0 },
  };
  let from = resolve(PROFILES[initial]), to = resolve(PROFILES[initial]);
  const cur = resolve(PROFILES[initial]), out = clone(cur);
  let t = 1, current = initial, brightness = 0, baked = false;
  // Baked grade (Low/Medium): no grading pass; saturation is folded into the light, fog and
  // sky colours instead, so presence (saturation -> 0.3) still desaturates the frame
  // through those values. Emissives other than the fire light are not graded.
  const lumW = [0.2126, 0.7152, 0.0722];
  const desat = (c, k) => { const l = c.r * lumW[0] + c.g * lumW[1] + c.b * lumW[2];
    c.setRGB(Math.max(0, l + (c.r - l) * k), Math.max(0, l + (c.g - l) * k), Math.max(0, l + (c.b - l) * k)); return c; };
  const fireBase = new THREE.Color(FIRE.color);
  // presence: 0..1; on = held
  const presence = { value: 0, on: false };
  const flat = new THREE.Color(PRESENCE.flat), paleFog = new THREE.Color(PRESENCE.fog);

  function patchMaterial(m) {
    if (!m || m.userData.__atmo || m.isShaderMaterial) return;
    m.userData.__atmo = true;
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => { prev?.call(m, sh, r); Object.assign(sh.uniforms, uniforms); };
  }
  function patchScene(root = scene) { root.traverse((o) => { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(patchMaterial); }); }

  function setProfile(name, blendSec = BLEND_SEC) {
    if (!PROFILES[name]) throw new Error(`unknown profile ${name}`);
    if (name === current && blendSec > 0) return;
    current = name; from = clone(cur); to = resolve(PROFILES[name]);
    t = blendSec > 0 ? 0 : 1; rate = blendSec > 0 ? 1 / blendSec : 0;
    if (t >= 1) lerpState(cur, to, to, 0);
  }
  let rate = 0;
  function setPresence(on, instant = false) { presence.on = on; if (instant) presence.value = on ? 1 : 0; }

  const sunDir = new THREE.Vector3();
  function apply() {
    const p = presence.value;
    lerpState(out, cur, cur, 0);
    out.key.lerp(flat, p); out.sky.lerp(flat, p); out.ground.lerp(flat, p);
    out.fog.lerp(paleFog, p); out.fogDensity *= 1 + (PRESENCE.fogScale - 1) * p;
    out.exposure += (PRESENCE.exposure - out.exposure) * p;
    out.saturation += (PRESENCE.saturation - out.saturation) * p;
    out.hemiInt += (PRESENCE.hemiInt - out.hemiInt) * p; out.keyInt += (PRESENCE.keyInt - out.keyInt) * p;
    // shadows flattened via sun.shadow.intensity -> 0 below; hemi fill raised so undersides go pale
    if (baked) { for (const k of ['key', 'sky', 'ground', 'fog']) desat(out[k], out.saturation); }
    grade.enabled = !baked;
    sun.color.copy(out.key); sun.intensity = out.keyInt;
    const el = THREE.MathUtils.degToRad(out.sunDeg), az = THREE.MathUtils.degToRad(out.sunAzDeg);
    sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    sun.position.copy(sun.target.position).addScaledVector(sunDir, 25);
    sun.shadow.intensity = 1 - p;
    hemi.color.copy(out.sky); hemi.groundColor.copy(out.ground); hemi.intensity = out.hemiInt;
    fog.color.copy(out.fog); fog.density = out.fogDensity; applySky(out.fog, out.skyGrad * (1 - p), baked ? out.saturation : 1);
    renderer.toneMappingExposure = out.exposure * brightnessScale(brightness);
    grade.uniforms.uSaturation.value = out.saturation;
    grade.uniforms.uLift.value.copy(out.lift).multiplyScalar(1 - p);
    grade.uniforms.uPresence.value = p;
    uniforms.uPresence.value = p;
    uniforms.uFireOn.value = out.fire;
    if (fire) { fire.color.copy(fireBase); if (baked) desat(fire.color, out.saturation); fire.intensity = FIRE.intensity * out.fire; uniforms.uFirePos.value.copy(fire.getWorldPosition(new THREE.Vector3())); }
  }
  function update(dt) {
    if (t < 1) { t = Math.min(1, t + dt * rate); lerpState(cur, from, to, t); }
    const target = presence.on ? 1 : 0;
    if (presence.value < target) presence.value = Math.min(1, presence.value + dt / PRESENCE.rampIn);
    else if (presence.value > target) presence.value = Math.max(0, presence.value - dt / PRESENCE.release);
    apply();
  }
  setProfile(initial, 0); apply();
  return {
    uniforms, grade, presence, patchMaterial, patchScene, setProfile, setPresence, update,
    setBakedGrade(on) { baked = !!on; apply(); }, get bakedGrade() { return baked; },
    setBrightness(b) { brightness = clampBrightness(b); apply(); return brightness; }, get brightness() { return brightness; },
    get profile() { return current; }, get blend() { return t; }, get state() { return out; },
    weights: () => ({ cloakRimMin: out.cloakRimMin, decay: out.decay, fire: out.fire, winter: out.winter, presence: presence.value }),
  };
}

// Render-side zone triggers: axis-aligned volumes; entering one blends to its profile.
export function createZoneTriggers(zones, lighting) {
  let inside = null, first = true;
  return {
    update(pos) {
      const z = zones.find((v) => pos.x >= v.min[0] && pos.x <= v.max[0] && pos.y >= v.min[1] && pos.y <= v.max[1] && pos.z >= v.min[2] && pos.z <= v.max[2]);
      const id = z ? z.profile : null;
      if (first) { first = false; inside = id; return inside; } // spawn zone: keep the initial/debug profile
      if (id !== inside) { inside = id; if (id) lighting.setProfile(id); }
      return inside;
    },
    get inside() { return inside; },
  };
}
