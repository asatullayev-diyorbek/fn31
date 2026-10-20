import { describe, expect, it } from "vitest";
import {
  angleDelta,
  pinchAngleDegrees,
  pinchDistance,
  pinchMidpoint,
  snapRotationDeltaToStep,
} from "./gesture";

describe("pinch gesture math", () => {
  it("computes distance and midpoint between two touch points", () => {
    expect(pinchDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(pinchMidpoint({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 });
  });

  it("computes the twist angle between two touch points", () => {
    expect(pinchAngleDegrees({ x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(0, 5);
    expect(pinchAngleDegrees({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(90, 5);
  });
});

describe("angleDelta", () => {
  it("wraps correctly across the 0/360 boundary", () => {
    expect(angleDelta(350, 10)).toBeCloseTo(20, 5);
    expect(angleDelta(10, 350)).toBeCloseTo(-20, 5);
  });
});

describe("snapRotationDeltaToStep", () => {
  it("snaps near-90-degree gestures to the 90-degree step", () => {
    expect(snapRotationDeltaToStep(80)).toBe(90);
    expect(snapRotationDeltaToStep(-100)).toBe(-90);
    expect(snapRotationDeltaToStep(170)).toBe(180);
    expect(snapRotationDeltaToStep(10)).toBe(0);
  });
});
