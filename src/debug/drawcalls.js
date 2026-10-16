// Per-system draw-call breakdown (debug only; records, never changes what is drawn).
// Wraps renderer.renderBufferDirect for one frame, tagging each call with the active
// composer pass (or the shadow pass) and the owning system of the drawn object.
export function createDrawCallProbe({ renderer, composer, passNames }) {
  let ctx = null, rec = null;
  const rbd = renderer.renderBufferDirect.bind(renderer);
  renderer.renderBufferDirect = (camera, scene, geometry, material, object, group) => {
    if (rec) { const k = classify(object, material); rec[k] = (rec[k] || 0) + 1; }
    return rbd(camera, scene, geometry, material, object, group);
  };
  const sm = renderer.shadowMap, smRender = sm.render.bind(sm);
  sm.render = (...a) => { const prev = ctx; ctx = 'shadow'; try { return smRender(...a); } finally { ctx = prev; } };
  for (const p of composer.passes) {
    const r = p.render.bind(p), name = passNames.get(p) || p.constructor.name;
    p.render = (...a) => { const prev = ctx; ctx = name; try { return r(...a); } finally { ctx = prev; } };
  }
  function owner(o) {
    for (let n = o; n; n = n.parent) {
      if (n.name === 'solenius-standin') return 'stand-in parts';
      if (n.userData?.dc) return n.userData.dc;
    }
    if (o.isPoints) return 'particles';
    return o.name || o.type;
  }
  function classify(object, material) {
    if (ctx === 'shadow') return `shadow pass: ${owner(object)}`;
    if (ctx === 'main') {
      if (material && /^Background/.test(material.name || '') || material?.type === 'ShaderMaterial' && !object.parent) return 'main: sky (background)';
      return `main: ${owner(object)}`;
    }
    return ctx || 'other';
  }
  return {
    capture(renderFn) {
      rec = {}; renderer.info.reset(); renderFn(); const out = rec; rec = null;
      return { total: renderer.info.render.calls, sum: Object.values(out).reduce((a, b) => a + b, 0), systems: out };
    },
  };
}
