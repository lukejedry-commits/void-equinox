// Colour-grading pass timer (debug, render-side only). Shown in the backtick perf overlay
// as `grade X.XX ms`.
//  - GPU path: EXT_disjoint_timer_query_webgl2 TIME_ELAPSED query wrapped around the grade
//    pass alone (one query in flight, polled on later frames).
//  - CPU fallback (e.g. iOS Safari, which has no timer query): once per `probeEverySec`
//    the frame is rendered twice extra, grade on and grade off, each closed by a 1-pixel
//    readPixels sync; the smoothed difference is the grading cost. The real frame is then
//    rendered normally, so what is on screen never changes.
export function createGradeTimer({ renderer, composer, grade, probeEverySec = 1, smoothing = 0.2 }) {
  const gl = renderer.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const px = new Uint8Array(4);
  const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let ms = null, query = null, wantQuery = false, sinceProbe = probeEverySec, warmup = 3, flip = false;
  const feed = (v) => { ms = ms == null ? v : ms + (v - ms) * smoothing; };

  if (ext) {
    const inner = grade.render.bind(grade);
    grade.render = (...a) => {
      if (!wantQuery || query) return inner(...a);
      query = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
      inner(...a);
      gl.endQuery(ext.TIME_ELAPSED_EXT);
    };
  }
  function poll() {
    if (!query) return;
    if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) return;
    if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) feed(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
    gl.deleteQuery(query); query = null;
  }
  function cpuProbe() {
    // Alternate the on/off order so pipeline warm-up does not bias one side; the first
    // probes (shader compiles, render-target allocation) are discarded.
    const run = (on) => { grade.enabled = on; const t = performance.now(); composer.render(); sync(); return performance.now() - t; };
    sync(); flip = !flip;
    let on, off;
    if (flip) { on = run(true); off = run(false); } else { off = run(false); on = run(true); }
    grade.enabled = true;
    if (warmup > 0) { warmup--; return; }
    feed(Math.max(0, on - off));
  }
  return {
    mode: ext ? 'gpu' : 'cpu',
    get ms() { return ms; },
    // Call once per frame before the real render; `active` = overlay visible.
    frame(dt, active) {
      wantQuery = active && !!ext;
      if (!active) return;
      if (ext) { poll(); return; }
      sinceProbe += dt;
      if (sinceProbe >= probeEverySec) { sinceProbe = 0; cpuProbe(); }
    },
  };
}
