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
};

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
  function move(desired) {
    const len = Math.hypot(desired.x, desired.y, desired.z);
    const n = Math.max(1, Math.ceil(len / maxSub));
    const sd = { x: desired.x / n, y: desired.y / n, z: desired.z / n };
    const t0 = entry.body.translation();
    const total = { x: 0, y: 0, z: 0 };
    let grounded = false;
    for (let i = 0; i < n; i++) {
      kcc.computeColliderMovement(entry.collider, sd);
      const m = kcc.computedMovement();
      grounded = kcc.computedGrounded();
      total.x += m.x; total.y += m.y; total.z += m.z;
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
  };

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
    s.vel.y = s.grounded ? -1 : s.vel.y + T.gravity * dt; // TODO(Mechanics)

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

  return { id, state: s, update, pushRaw, subSteps: (d) => Math.max(1, Math.ceil(Math.hypot(d.x, d.y, d.z) / maxSub)), position: () => entry.body.translation(), kcc };
}
