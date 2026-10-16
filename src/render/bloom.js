// UnrealBloomPass mip-count control (draw calls). Each mip costs 2 blur draws; the stock
// composite shader hard-codes 5 mips, so a trimmed composite is built for fewer.
// Render-side only. Preset field: bloomMips (Medium 3, High 5).
const cache = new WeakMap();
export function setBloomMips(bloom, n) {
  n = Math.max(1, Math.min(5, n | 0));
  let mats = cache.get(bloom);
  if (!mats) { mats = { 5: bloom.compositeMaterial }; cache.set(bloom, mats); }
  if (!mats[n]) {
    const m = bloom._getCompositeMaterial(n);
    const terms = Array.from({ length: n }, (_, i) => `lerpBloomFactor( bloomFactors[ ${i} ] ) * bloomTintColors[ ${i} ] * texture2D( blurTexture${i + 1}, vUv ).rgb`).join(' +\n');
    m.fragmentShader = m.fragmentShader.replace(/3\.0 \* bloomStrength \* \([\s\S]*?\);/, `3.0 * bloomStrength * (\n${terms}\n);`);
    for (let i = 0; i < 5; i++) m.uniforms[`blurTexture${i + 1}`].value = bloom.renderTargetsVertical[i].texture;
    m.uniforms.bloomFactors.value = mats[5].uniforms.bloomFactors.value;
    m.uniforms.bloomTintColors.value = bloom.bloomTintColors;
    m.uniforms.bloomStrength.value = bloom.strength; m.uniforms.bloomRadius.value = bloom.radius;
    mats[n] = m;
  }
  bloom.nMips = n; bloom.compositeMaterial = mats[n];
}
