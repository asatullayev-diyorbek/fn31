export interface ScreenPoint {
  x: number;
  y: number;
}

export function pinchDistance(a: ScreenPoint, b: ScreenPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function pinchMidpoint(a: ScreenPoint, b: ScreenPoint): ScreenPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Two-finger twist angle in degrees, used to drive the rotate gesture. */
export function pinchAngleDegrees(a: ScreenPoint, b: ScreenPoint): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

/** Shortest signed angular delta between two angles in degrees, in (-180, 180]. */
export function angleDelta(fromDegrees: number, toDegrees: number): number {
  let delta = (toDegrees - fromDegrees) % 360;
  if (delta > 180) delta -= 360;
  if (delta <= -180) delta += 360;
  return delta;
}

/** Snaps a free rotation delta to the nearest supported discrete step (pieces only ever hold 0/90/180/270). */
export function snapRotationDeltaToStep(deltaDegrees: number): 0 | 90 | -90 | 180 {
  const steps: Array<0 | 90 | -90 | 180> = [0, 90, -90, 180];
  let closest: 0 | 90 | -90 | 180 = 0;
  let smallestDiff = Infinity;
  for (const step of steps) {
    const diff = Math.abs(angleDelta(deltaDegrees, step));
    if (diff < smallestDiff) {
      smallestDiff = diff;
      closest = step;
    }
  }
  return closest;
}
