import type { EdgeSpec, Point } from "./types";
import type { Prng } from "./prng";

/** Number of sample points per edge curve (shared by every edge in the puzzle, so continuity is exact). */
export const EDGE_SAMPLE_RESOLUTION = 12;

/**
 * A smooth, zero-at-both-ends "tab" bump: a raised cosine centered at
 * `knobPosition` with half-width `knobWidth`, peaking at `knobDepth`.
 * Zero outside the influence zone, continuous and C1 at its boundary, so
 * a polyline sampling of it has no visible kink.
 */
export function edgeOffsetAt(spec: EdgeSpec, t: number): number {
  if (spec.kind === "border" || spec.knobDepth === 0) return 0;
  const u = (t - spec.knobPosition) / spec.knobWidth;
  if (u <= -1 || u >= 1) return 0;
  const raisedCosine = (Math.cos(u * Math.PI) + 1) / 2;
  return spec.sign * spec.knobDepth * raisedCosine;
}

/**
 * Samples the 1D edge curve as (t, offset) pairs, t in [0, 1] ascending.
 * This exact array (same spec in → same array out) is what makes two
 * neighboring pieces' shared edge geometrically identical.
 */
export function sampleEdgeCurve(
  spec: EdgeSpec,
  resolution: number = EDGE_SAMPLE_RESOLUTION,
): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= resolution; i++) {
    const t = i / resolution;
    points.push({ x: t, y: edgeOffsetAt(spec, t) });
  }
  return points;
}

export function createInternalEdgeSpec(rng: Prng): EdgeSpec {
  return {
    kind: "internal",
    knobPosition: 0.35 + rng() * 0.3, // [0.35, 0.65]
    knobWidth: 0.12 + rng() * 0.06, // [0.12, 0.18]
    knobDepth: 0.18 + rng() * 0.06, // [0.18, 0.24]
    sign: rng() < 0.5 ? 1 : -1,
  };
}

export function createBorderEdgeSpec(): EdgeSpec {
  return {
    kind: "border",
    knobPosition: 0.5,
    knobWidth: 0.15,
    knobDepth: 0,
    sign: 1,
  };
}
