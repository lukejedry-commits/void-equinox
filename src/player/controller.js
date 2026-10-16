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

  // Anti-tunnelling guard: the KCC shape-cast can miss a thin wall when the capsule
  // already rests within its contact offset. Re-check horizontal motion with rays
  // against static geometry (3 heights) and clamp. Still no direct position writes.
  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
  const STATIC_ONLY = RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC | RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC;
  function guard(m) {
    const len = Math.hypot(m.x, m.z);
    if (len < 1e-6) return m;
    const t = entry.body.translation();
    const dx = m.x / len, dz = m.z / len;
    let allowed = len;
    for (const oy of [-T.halfHeight, 0, T.halfHeight]) {
      ray.origin = { x: t.x, y: t.y + oy, z: t.z }; ray.dir = { x: dx, y: 0, z: dz };
      const hit = world.castRay(ray, len + T.radius, true, STATIC_ONLY, undefined, entry.collider);
      if (hit) allowed = Math.min(allowed, Math.max(0, hit.timeOfImpact - T.radius - 0.02));
    }
    return allowed < len ? { x: dx * allowed, y: m.y, z: dz * allowed } : m;
  }
  function move(desired) {
    kcc.computeColliderMovement(entry.collider, desired);
    const m = guard(kcc.computedMovement());
    // Huge lateral pushes can make the KCC "climb" a vertical wall; cap rise to autostep.
    const maxRise = Math.max(desired.y, 0) + T.autostepHeight;
    if (m.y > maxRise) m.y = maxRise;
    const t = entry.body.translation();
    entry.body.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });
    return m;
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
    s.grounded = kcc.computedGrounded();
    entry.body.setNextKinematicRotation({ x: 0, y: Math.sin(s.yaw / 2), z: 0, w: Math.cos(s.yaw / 2) });
    if (s.dodgeLeft > 0) {
      s.dodgeTravel += Math.hypot(m.x, m.z);
      if (--s.dodgeLeft === 0) { s.lastDodgeDistance = s.dodgeTravel; s.dodgeCd = T.dodgeCooldownSteps; }
    }
  }

  // Test hook: arbitrary desired translation, still routed through the KCC.
  function pushRaw(desired) { return move(desired); }

  return { id, state: s, update, pushRaw, position: () => entry.body.translation(), kcc };
}
