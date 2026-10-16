// On-screen perf readout; toggle with backtick.
export function createPerf() {
  const el = document.createElement('pre');
  el.id = 'perf';
  el.style.cssText = 'position:fixed;top:8px;left:8px;margin:0;padding:6px 8px;background:#0009;color:#ffd9a0;font:12px/1.3 monospace;z-index:10;pointer-events:none';
  document.body.appendChild(el);
  let visible = true, ft = 16.7;
  window.addEventListener('keydown', (e) => { if (e.code === 'Backquote') { visible = !visible; el.style.display = visible ? '' : 'none'; } });
  return {
    get visible() { return visible; },
    update({ frameMs, physicsMs, steps, renderer, tier, auto, gradeMs = null, gradeMode = '' }) {
      ft = ft * 0.9 + frameMs * 0.1;
      if (!visible) return;
      const r = renderer.info.render;
      el.textContent =
        `frame   ${ft.toFixed(2)} ms (${(1000 / ft).toFixed(0)} fps)\n` +
        `physics ${physicsMs.toFixed(2)} ms  steps ${steps}\n` +
        `draws   ${r.calls}  tris ${r.triangles}\n` +
        `grade ${gradeMs == null ? '-.--' : gradeMs.toFixed(2)} ms (${gradeMode})\n` +
        `tier    ${tier}${auto ? ' (auto)' : ''}`;
    },
  };
}
