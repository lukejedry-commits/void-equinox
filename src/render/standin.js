// Solenius stand-in (Graphics brief): grey primitive mannequin, tall and heavily
// stooped, slumped shoulders, long thin arms, deep slightly pointed hood, cone cloak
// with ragged hem. VISUAL ONLY: lives under the physics-synced player group (origin =
// capsule centre, forward = -Z), reads sim state, never writes it.
// Palette rule: ash-grey/charcoal + ember only. Never sinking smoke, green-ochre or bruise-violet.
import * as THREE from 'three';
import { addRim } from './rim.js';

export const STANDIN = {
  ember: 0xff6a20,
  cloakTop: 0x5a5652,   // ash grey, desaturated (reads grey under every LightingProfile)
  cloakHem: 0x262422,   // charcoal
  body: 0x8a8a8a,       // mannequin grey
  rim: 0.15,            // default cloak rim floor; per-profile cloakRimMin overrides (lighting.js)
  cloakEmissive: 0x1a1816, cloakEmissiveInt: 0.05, // emissive floor so the cloak never crushes to black
  recoveryDefault: 0.15, // fixed dim on the slice
  feetY: -0.9,
};

// Deterministic hash for hem tatters (no Math.random: same silhouette every load).
const h = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

function cloakGeometry() {
  const H = 1.5, rTop = 0.2, rBot = 0.58, rs = 40, hs = 10;
  const g = new THREE.CylinderGeometry(rTop, rBot, H, rs, hs, true);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  const top = new THREE.Color(STANDIN.cloakTop), hem = new THREE.Color(STANDIN.cloakHem), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const t = (y + H / 2) / H; // 0 hem .. 1 top
    const a = Math.atan2(z, x), seg = Math.round(((a + Math.PI) / (2 * Math.PI)) * rs) % rs;
    if (t < 0.35) { // ragged, uneven tatters: jagged per-column offsets, strongest at the hem
      const w = (0.35 - t) / 0.35;
      const tear = (h(seg) * 0.22 + (seg % 3 === 0 ? 0.12 * h(seg + 50) : 0)) * w;
      y += tear; // uneven hem line
      const flare = 1 + 0.12 * w + (h(seg + 99) - 0.5) * 0.18 * w;
      x *= flare; z *= flare;
    }
    // slight backward drape (cloak hangs behind the stooped body)
    z += (1 - t) * 0.08;
    pos.setXYZ(i, x, y, z);
    c.copy(hem).lerp(top, Math.min(1, Math.pow(t, 0.7) * 1.15)); // darker hem
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.translate(0, H / 2, 0);
  return g;
}

function hoodGeometry() {
  // Lathe profile, opening at the front, pointed tip pulled back.
  const pts = [[0.17, 0], [0.2, 0.1], [0.19, 0.22], [0.13, 0.34], [0.05, 0.43], [0.0, 0.47]].map(([r, y]) => new THREE.Vector2(r, y));
  const gap = 0.24 * Math.PI * 2;
  const g = new THREE.LatheGeometry(pts, 28, Math.PI + gap / 2, Math.PI * 2 - gap); // gap faces -Z
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, p.getZ(i) + Math.pow(y / 0.47, 2) * 0.1); } // tip leans back
  g.computeVertexNormals();
  return g;
}

export function createStandin() {
  const root = new THREE.Group(); root.name = 'solenius-standin';
  const rig = new THREE.Group(); rig.position.y = STANDIN.feetY; root.add(rig); // feet at capsule bottom
  const bodyMat = new THREE.MeshStandardMaterial({ color: STANDIN.body, roughness: 0.8 });
  const cloakMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.95, side: THREE.DoubleSide, transparent: true,
    emissive: STANDIN.cloakEmissive, emissiveIntensity: STANDIN.cloakEmissiveInt });
  const cloakRim = addRim(cloakMat, { color: 0xd8d4cc, strength: STANDIN.rim, power: 3 });
  const recovery = { value: STANDIN.recoveryDefault };
  const emberMats = [];
  const emberMat = () => { const m = new THREE.MeshStandardMaterial({ color: 0x220a00, emissive: STANDIN.ember, emissiveIntensity: 2 }); emberMats.push(m); return m; };
  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };

  // Legs (mostly hidden by the cloak).
  for (const s of [-1, 1]) add(rig, new THREE.CylinderGeometry(0.06, 0.05, 0.95, 8), bodyMat, s * 0.11, 0.48, 0);
  const cloak = add(rig, cloakGeometry(), cloakMat, 0, 0, 0);

  // Upper body pivots at the hips and stoops heavily forward (-Z).
  const upper = new THREE.Group(); upper.position.y = 1.0; rig.add(upper);
  const BASE_STOOP = -0.42;
  const HEAD_PITCH = -20 * Math.PI / 180; // head+hood hang ~20 deg forward/down from the torso line
  const SHOULDER_DROP = 0.07;             // shoulders slump below the neck line
  upper.rotation.x = BASE_STOOP;
  add(upper, new THREE.CylinderGeometry(0.17, 0.14, 0.62, 10), bodyMat, 0, 0.3, 0);
  const mantle = add(upper, new THREE.SphereGeometry(1, 16, 10), cloakMat, 0, 0.58 - SHOULDER_DROP, 0.03);
  mantle.scale.set(0.34, 0.12, 0.2); mantle.rotation.x = 0.18; // slumped shoulder cape
  const chest = add(upper, new THREE.SphereGeometry(0.035, 10, 8), emberMat(), 0, 0.42, -0.165);

  // Neck juts forward from the stoop; head hangs.
  const head = new THREE.Group(); head.position.set(0, 0.62, -0.13); head.rotation.x = HEAD_PITCH; upper.add(head);
  add(head, new THREE.SphereGeometry(0.11, 12, 10), new THREE.MeshStandardMaterial({ color: 0x0b0a0a, roughness: 1 }), 0, 0.12, 0.01); // face in shadow
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x7a2c10 }); // faint ember eyes
  for (const s of [-1, 1]) add(head, new THREE.SphereGeometry(0.009, 6, 4), eyeMat, s * 0.035, 0.14, -0.1);
  const hood = add(head, hoodGeometry(), cloakMat, 0, -0.05, 0.02);

  // Long thin arms from slumped shoulders.
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.27, 0.52 - SHOULDER_DROP, 0.01); sh.rotation.z = s * 0.06; upper.add(sh);
    add(sh, new THREE.CylinderGeometry(0.075, 0.06, 0.42, 8), cloakMat, 0, -0.2, 0); // sleeve
    add(sh, new THREE.CylinderGeometry(0.04, 0.035, 0.44, 8), bodyMat, 0, -0.2, 0);
    const el = new THREE.Group(); el.position.y = -0.42; sh.add(el);
    add(el, new THREE.CylinderGeometry(0.035, 0.028, 0.46, 8), bodyMat, 0, -0.23, 0);
    const hand = add(el, new THREE.SphereGeometry(0.045, 10, 8), bodyMat, 0, -0.5, 0);
    hand.scale.set(0.7, 1.4, 1);
    add(el, new THREE.SphereGeometry(0.022, 8, 6), emberMat(), -s * 0.02, -0.5, -0.025); // palm ember
    arms.push({ sh, el, s });
  }
  // Ember leak: faint additive bands where inner fire escapes the cloth (hood inner edge,
  // hem underside) so the fire reads from behind. Scaled by `recovery` in applyRecovery().
  const leakMat = new THREE.MeshBasicMaterial({ color: STANDIN.ember, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true, toneMapped: true });
  const hoodLeak = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.018, 6, 28), leakMat);
  hoodLeak.rotation.x = Math.PI / 2; hoodLeak.position.set(0, -0.02, 0.02); hoodLeak.name = 'ember-leak-hood'; head.add(hoodLeak);
  const hemLeak = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.62, 40, 1), leakMat);
  hemLeak.rotation.x = -Math.PI / 2; hemLeak.position.set(0, 0.04, 0.06); hemLeak.name = 'ember-leak-hem'; rig.add(hemLeak);
  const glow = new THREE.PointLight(STANDIN.ember, 0.8, 2.2); glow.position.set(0, 0.42, -0.3); upper.add(glow);

  let phase = 0, lean = 0, lunge = 0;
  function applyRecovery() {
    const k = 0.35 + 0.65 * Math.min(1, Math.max(0, recovery.value));
    for (const m of emberMats) m.emissiveIntensity = 3 * k;
    glow.intensity = 1.2 * k;
    leakMat.opacity = 0.32 * k; // low intensity: a hint of fire, not a lamp
  }
  applyRecovery();

  return {
    object: root, recovery,
    get recoveryValue() { return recovery.value; },
    setRecovery(v) { recovery.value = v; applyRecovery(); },
    // Per-profile fresnel rim floor on the cloak (LightingProfile.cloakRimMin).
    setCloakRimMin(v) { cloakRim.rimStrength.value = Math.max(0, v); },
    get cloakRimMin() { return cloakRim.rimStrength.value; },
    setFade(opacity) { cloakMat.opacity = opacity; cloakMat.depthWrite = opacity >= 1; },
    // speed: horizontal m/s from interpolated positions; dodging: sim dodge active (read-only).
    update(dt, { speed = 0, dodging = false } = {}) {
      const s01 = Math.min(1, speed / 6);
      phase += dt * (2 + speed * 1.6);
      lean += ((dodging ? 0 : s01 * 0.18) - lean) * Math.min(1, dt * 8);
      lunge += ((dodging ? 1 : 0) - lunge) * Math.min(1, dt * (dodging ? 18 : 6));
      rig.position.y = STANDIN.feetY + Math.abs(Math.sin(phase)) * 0.035 * s01 - lunge * 0.12;
      rig.rotation.x = -lean - lunge * 0.35;
      rig.position.z = -lunge * 0.15;
      upper.rotation.x = BASE_STOOP - lunge * 0.25;
      head.rotation.x = HEAD_PITCH - lunge * 0.3;
      for (const a of arms) {
        const swing = Math.sin(phase + (a.s > 0 ? 0 : Math.PI)) * 0.35 * s01;
        a.sh.rotation.x = 0.15 + swing * (1 - lunge) + lunge * 1.1; // lunge: arms thrown back
        a.el.rotation.x = -0.25 - lunge * 0.3;
      }
      cloak.scale.set(1, 1, 1 + 0.12 * (s01 + lunge)); hemLeak.scale.set(1, 1 + 0.12 * (s01 + lunge), 1);
    },
  };
}
