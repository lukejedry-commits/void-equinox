// Kinematic capsule driven by Rapier KinematicCharacterController.
// All motion goes through computeColliderMovement -> setNextKinematicTranslation.

// TODO(Mechanics): every number below is a placeholder pending mechanics design.
export const PLAYER_TUNING = {
  radius: 0.35, halfHeight: 0.55,       // TODO(Mechanics)
  slopeLimitDeg: 45,                    // TODO(Mechanics)
  autostepHeight: 0.3, autostepMinWidth: 0.2, // TODO(Mechanics)
  snapDistance: 0.3,                    // TODO(Mechanics)
  baseTopSpeed: 6, baseAccel: 40, baseTurnRate: 14, // TODO(Mechanics)
  dodgeSpeed: 14, dodgeSteps: 12, dodgeCooldownSteps: 30, // TODO(Mechanics)
  gravity: -20,                         // TODO(Mechanics)
  knockbackDamping: 6,                  // 1/s exponential decay of external velocity. TODO(Mechanics)
};

// Max horizontal speed any velocity state may hold: the per-step displacement cap
// (MAX_SUBSTEPS * 0.5 * radius = 1.4 m) over one fixed step (1/60 s) = 84 m/s.
export const MAX_H_SPEED = 1.4 / (1 / 60);
function clampH(v, max = MAX_H_SPEED) {
  const h = Math.hypot(v.x, v.z);
  if (h > max) { const k = max / h; v.x *= k; v.z *= k; }
  return v;
}

// heaviness 0 (light) .. 1 (heavy) scales accel/turn/top speed together.
export function derivedStats(heaviness, T = PLAYER_TUNING) {
  const h = Math.min(1, Math.max(0, heaviness));
  return {
    topSpeed: T.baseTopSpeed * (1.2 - 0.5 * h),  // TODO(Mechanics)
    accel: T.baseAccel * (1.3 - 0.8 * h),        // TODO(Mechanics)
    turnRate: T.baseTurnRate * (1.3 - 0.9 * h),  // TODO(Mechanics)
  };
}

export function createPlayer(phys, { x = 0, y = 2, z = 0, heaviness = 0.5, tuning = PLAYER_TUNING } = {}) {
  const { RAPIER, world } = phys;
  const T = tuning;
  const id = phys.add(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z),
    RAPIER.ColliderDesc.capsule(T.halfHeight, T.radius), 'player');
  const entry = phys.get(id);
  const kcc = world.createCharacterController(0.02);
  kcc.setUp({ x: 0, y: 1, z: 0 });
  kcc.setSlideEnabled(true);
  kcc.setMaxSlopeClimbAngle(T.slopeLimitDeg * Math.PI / 180);
  kcc.setMinSlopeSlideAngle(T.slopeLimitDeg * Math.PI / 180);
  kcc.enableAutostep(T.autostepHeight, T.autostepMinWidth, false);
  kcc.enableSnapToGround(T.snapDistance);
  kcc.setApplyImpulsesToDynamicBodies(true);

  // Anti-tunnelling via substepping: split the desired translation into
  // N = ceil(|desired| / (0.5 * radius)) sub-moves, each swept by the KCC from the
  // position the previous sub-move reached. The collider pose is advanced only by
  // computed movement (so each sweep starts at the new spot); the body gets the
  // summed movement as its next kinematic translation. Deterministic: N is a pure
  // function of the input vector.
  const maxSub = 0.5 * T.radius;
  let lastGrounded = false;
  let stallRetries = 0;
  // Perf cap: at most MAX_SUBSTEPS sub-moves per step. The desired horizontal
  // translation is clamped to MAX_SUBSTEPS * maxSub (= 1.4 m) and the excess is
  // dropped, so a sub-move never exceeds maxSub. (If a vertical component would
  // still push |d| over the cap, the whole vector is scaled to the cap.)
  const MAX_SUBSTEPS = 8, maxStep = MAX_SUBSTEPS * maxSub;
  function clampDesired(d) {
    let { x, y, z } = d;
    const h = Math.hypot(x, z);
    if (h > maxStep) { const k = maxStep / h; x *= k; z *= k; }
    const l = Math.hypot(x, y, z);
    if (l > maxStep) { const k = maxStep / l; x *= k; y *= k; z *= k; }
    return { x, y, z };
  }
  const nSub = (d) => Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(Math.hypot(d.x, d.y, d.z) / maxSub)));
  const stats = { lastN: 0, lastSubLen: 0, lastClamped: { x: 0, y: 0, z: 0 }, clampedSteps: 0 };
  function move(desiredIn) {
    const desired = clampDesired(desiredIn);
    if (desired.x !== desiredIn.x || desired.y !== desiredIn.y || desired.z !== desiredIn.z) stats.clampedSteps++;
    const n = nSub(desired);
    const sd = { x: desired.x / n, y: desired.y / n, z: desired.z / n };
    stats.lastN = n; stats.lastSubLen = Math.hypot(sd.x, sd.y, sd.z); stats.lastClamped = desired;
    const t0 = entry.body.translation();
    const total = { x: 0, y: 0, z: 0 };
    let grounded = false;
    for (let i = 0; i < n; i++) {
      kcc.computeColliderMovement(entry.collider, sd);
      const m = kcc.computedMovement();
      grounded = kcc.computedGrounded();
      total.x += m.x; total.y += m.y; total.z += m.z;
      // Stall recovery: a sub-move that achieved <10% of its request while in
      // contact is retried ONCE from where it stopped with the remaining movement.
      const req = Math.hypot(sd.x, sd.y, sd.z), got = Math.hypot(m.x, m.y, m.z);
      if (req > 0 && got < 0.1 * req && kcc.numComputedCollisions() > 0) {
        entry.collider.setTranslation({ x: t0.x + total.x, y: t0.y + total.y, z: t0.z + total.z });
        kcc.computeColliderMovement(entry.collider, { x: sd.x - m.x, y: sd.y - m.y, z: sd.z - m.z });
        const m2 = kcc.computedMovement();
        grounded = kcc.computedGrounded();
        total.x += m2.x; total.y += m2.y; total.z += m2.z;
        stallRetries++;
      }
      if (i < n - 1) entry.collider.setTranslation({ x: t0.x + total.x, y: t0.y + total.y, z: t0.z + total.z });
    }
    lastGrounded = grounded;
    entry.body.setNextKinematicTranslation({ x: t0.x + total.x, y: t0.y + total.y, z: t0.z + total.z });
    return total;
  }

  const s = {
    id, heaviness, vel: { x: 0, y: 0, z: 0 }, yaw: 0,
    dodgeLeft: 0, dodgeCd: 0, dodgeDir: { x: 0, z: -1 }, grounded: false,
    dodgeTravel: 0, lastDodgeDistance: 0,
    ext: { x: 0, z: 0 }, // knockback / external push velocity (m/s), |ext| <= MAX_H_SPEED
  };

  // Knockback: added to the stored external velocity, clamped AT STORE TIME so no
  // excess persists into later steps.
  function applyKnockback(v) {
    s.ext.x += v.x; s.ext.z += v.z;
    clampH(s.ext);
  }

  // Called once per fixed step, before phys.step().
  function update(input, dt) {
    const st = derivedStats(s.heaviness, T);
    let ix = input.mx, iz = input.mz;
    const len = Math.hypot(ix, iz);
    if (len > 1) { ix /= len; iz /= len; }

    if (s.dodgeCd > 0) s.dodgeCd--;
    if (input.dodge && s.dodgeLeft === 0 && s.dodgeCd === 0) {
      if (len > 0) s.dodgeDir = { x: ix, z: iz };
      else s.dodgeDir = { x: -Math.sin(s.yaw), z: -Math.cos(s.yaw) };
      s.dodgeLeft = T.dodgeSteps; s.dodgeTravel = 0;
    }

    let dx, dz;
    if (s.dodgeLeft > 0) { // placeholder dodge: fixed-speed burst through the KCC
      dx = s.dodgeDir.x * T.dodgeSpeed; dz = s.dodgeDir.z * T.dodgeSpeed;
      s.vel.x = dx; s.vel.z = dz;
    } else {
      const tx = ix * st.topSpeed, tz = iz * st.topSpeed;
      const maxDv = st.accel * dt;
      const ex = tx - s.vel.x, ez = tz - s.vel.z, el = Math.hypot(ex, ez);
      const k = el > maxDv ? maxDv / el : 1;
      s.vel.x += ex * k; s.vel.z += ez * k;
      dx = s.vel.x; dz = s.vel.z;
      if (len > 0) { // turn toward input
        const target = Math.atan2(-ix, -iz);
        let d = target - s.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        const m = st.turnRate * dt; s.yaw += Math.max(-m, Math.min(m, d));
      }
    }
    // Grounded: no downward push. Snap-to-ground keeps contact. A constant -1 m/s
    // drove the capsule into the KCC contact-offset skin, and the next step's
    // computeColliderMovement spent itself on depenetration and returned zero
    // horizontal movement (that was the dodge step that did not move).
    clampH(s.vel); // carried velocity never exceeds the cap
    if (s.ext.x !== 0 || s.ext.z !== 0) {
      clampH(s.ext);
      dx += s.ext.x; dz += s.ext.z;
      const c = clampH({ x: dx, z: dz }); dx = c.x; dz = c.z;
      const k = Math.max(0, 1 - T.knockbackDamping * dt);
      s.ext.x *= k; s.ext.z *= k;
      if (Math.hypot(s.ext.x, s.ext.z) < 1e-3) { s.ext.x = 0; s.ext.z = 0; }
    }
    s.vel.y = s.grounded ? 0 : s.vel.y + T.gravity * dt; // TODO(Mechanics)

    const desired = { x: dx * dt, y: s.vel.y * dt, z: dz * dt };
    const m = move(desired);
    s.grounded = lastGrounded;
    entry.body.setNextKinematicRotation({ x: 0, y: Math.sin(s.yaw / 2), z: 0, w: Math.cos(s.yaw / 2) });
    if (s.dodgeLeft > 0) {
      s.dodgeTravel += Math.hypot(m.x, m.z);
      if (--s.dodgeLeft === 0) { s.lastDodgeDistance = s.dodgeTravel; s.dodgeCd = T.dodgeCooldownSteps; }
    }
  }

  // Test hook: arbitrary desired translation, still routed through the KCC.
  function pushRaw(desired) { return move(desired); }

  return { id, state: s, update, pushRaw, applyKnockback, MAX_H_SPEED, subSteps: (d) => nSub(clampDesired(d)), moveStats: stats, MAX_SUBSTEPS, maxSub, position: () => entry.body.translation(), kcc, stallRetries: () => stallRetries };
}
