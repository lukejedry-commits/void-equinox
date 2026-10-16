// Fresnel rim term injected into a MeshStandardMaterial via onBeforeCompile.
// Render-only. Returns uniforms so strength/colour can be animated.
// Chains with any existing onBeforeCompile (see chainCompile), so several rims (lock-on,
// tell flare) and the atmosphere patch can coexist on one material. `id` suffixes the
// uniform names; `base` adds a view-independent flare term (base * strength) on top.
import * as THREE from 'three';

export function chainCompile(material, key, fn) {
  const prev = material.onBeforeCompile, prevKey = material.customProgramCacheKey;
  material.onBeforeCompile = (sh, r) => { prev?.call(material, sh, r); fn(sh, r); };
  material.customProgramCacheKey = () => `${prevKey ? prevKey.call(material) : ''}|${key}`;
}

// `mask`: optional float vertex attribute name scaling the rim per vertex (merged meshes).
export function addRim(material, { color = 0xffffff, strength = 0.15, power = 3, id = '', base = 0, mask = null } = {}) {
  const C = `rimColor${id}`, S = `rimStrength${id}`, P = `rimPower${id}`;
  const u = { [C]: { value: new THREE.Color(color) }, [S]: { value: strength }, [P]: { value: power } };
  // Backward-compatible aliases (callers use .rimColor / .rimStrength / .rimPower).
  u.rimColor = u[C]; u.rimStrength = u[S]; u.rimPower = u[P];
  chainCompile(material, `rim${id}${power}${base}${mask || ''}`, (sh) => {
    sh.uniforms[C] = u[C]; sh.uniforms[S] = u[S]; sh.uniforms[P] = u[P];
    const M = mask ? `v${mask}${id}` : '1.0';
    if (mask) sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float ${mask}; varying float ${M};`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${M} = ${mask};`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 ${C}; uniform float ${S}; uniform float ${P};${mask ? ` varying float ${M};` : ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float fr = pow(1.0 - clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0), ${P});
          totalEmissiveRadiance += ${C} * ${S} * (fr + ${base.toFixed(3)}) * ${M}; }`);
  });
  return u;
}
