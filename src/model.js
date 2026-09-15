export const WORLD = Object.freeze({ min: -1, max: 1, waterLevel: 0 });

export const ACTUATOR = Object.freeze({
  x: 0,
  y: 0,
  outerRadius: 0.1,
  innerRadius: 0.06,
  height: 0.1,
  restZ: -0.22,
  defaultAmplitude: 0.085,
  defaultFrequency: 1.2,
});

export const LEG_REEFS = Object.freeze([
  {
    name: '西侧弧礁',
    points: [
      [-0.93, 0.76, -0.58],
      [-0.84, 0.64, -0.28],
      [-0.72, 0.53, 0.16],
      [-0.60, 0.43, 0.08],
      [-0.49, 0.34, -0.24],
      [-0.39, 0.25, -0.56],
    ],
  },
  {
    name: '东侧弧礁',
    points: [
      [0.93, 0.76, -0.58],
      [0.84, 0.64, -0.28],
      [0.72, 0.53, 0.16],
      [0.60, 0.43, 0.08],
      [0.49, 0.34, -0.24],
      [0.39, 0.25, -0.56],
    ],
  },
]);

export function actuatorZ(time, amplitude = ACTUATOR.defaultAmplitude, frequency = ACTUATOR.defaultFrequency) {
  return ACTUATOR.restZ + amplitude * Math.sin(2 * Math.PI * frequency * time);
}

export function actuatorVelocity(time, amplitude = ACTUATOR.defaultAmplitude, frequency = ACTUATOR.defaultFrequency) {
  return amplitude * 2 * Math.PI * frequency * Math.cos(2 * Math.PI * frequency * time);
}

export function rearReefHeight(x, y) {
  if (y > -0.5 || y < -1 || Math.abs(x) > 0.66) return -1;
  const t = Math.min(1, Math.max(0, (-y - 0.5) / 0.5));
  const halfWidth = 0.60 + 0.05 * Math.sin(t * Math.PI);
  const q = Math.abs(x) / halfWidth;
  if (q >= 1) return -1;
  const crown = Math.pow(1 - Math.pow(q, 3.2), 0.55);
  return -0.22 + 0.78 * Math.pow(t, 1.18) * crown - 0.08 * q * q;
}

export function isReefFootprint(x, y) {
  if (rearReefHeight(x, y) > -0.95) return true;
  for (const reef of LEG_REEFS) {
    for (let i = 0; i < reef.points.length - 1; i += 1) {
      const a = reef.points[i];
      const b = reef.points[i + 1];
      const vx = b[0] - a[0];
      const vy = b[1] - a[1];
      const wx = x - a[0];
      const wy = y - a[1];
      const u = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy)));
      if (Math.hypot(x - (a[0] + u * vx), y - (a[1] + u * vy)) < 0.105) return true;
    }
  }
  return false;
}

export function validateModel() {
  const top = ACTUATOR.restZ + ACTUATOR.defaultAmplitude + ACTUATOR.height / 2;
  return {
    actuatorSubmerged: top < WORLD.waterLevel,
    kneesEmerge: LEG_REEFS.every((reef) => reef.points.some((point) => point[2] > WORLD.waterLevel)),
    rearRisesSeaward: rearReefHeight(0, -0.95) > rearReefHeight(0, -0.55),
  };
}
