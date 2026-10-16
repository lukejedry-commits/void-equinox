// Fresnel rim term injected into a MeshStandardMaterial via onBeforeCompile.
// Render-only. Returns uniforms so strength/colour can be animated.
import * as THREE from 'three';
export function addRim(material, { color = 0xffffff, strength = 0.15, power = 3 } = {}) {
  const u = { rimColor: { value: new THREE.Color(color) }, rimStrength: { value: strength }, rimPower: { value: power } };
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rimColor; uniform float rimStrength; uniform float rimPower;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float fr = pow(1.0 - clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0), rimPower);
          totalEmissiveRadiance += rimColor * rimStrength * fr; }`);
  };
  material.customProgramCacheKey = () => `rim${power}`;
  return u;
}
