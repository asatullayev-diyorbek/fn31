import { describe, expect, it } from "vitest";
import {
  clampZoom,
  fitToScreenViewport,
  screenToWorld,
  worldToScreen,
  zoomAroundPoint,
} from "./viewport";

describe("worldToScreen / screenToWorld", () => {
  it("round-trips through pan and zoom", () => {
    const viewport = { zoom: 2, panX: 50, panY: -20 };
    const screen = worldToScreen(viewport, 123, 456);
    const world = screenToWorld(viewport, screen.x, screen.y);
    expect(world.x).toBeCloseTo(123, 6);
    expect(world.y).toBeCloseTo(456, 6);
  });
});

describe("clampZoom", () => {
  it("clamps to the documented min/max range", () => {
    expect(clampZoom(0)).toBeGreaterThan(0);
    expect(clampZoom(1000)).toBeLessThanOrEqual(6);
  });
});

describe("fitToScreenViewport", () => {
  it("centers content and keeps it fully visible", () => {
    const viewport = fitToScreenViewport(1000, 500, 800, 600, 20);
    const topLeft = worldToScreen(viewport, 0, 0);
    const bottomRight = worldToScreen(viewport, 1000, 500);
    expect(topLeft.x).toBeGreaterThanOrEqual(0);
    expect(topLeft.y).toBeGreaterThanOrEqual(0);
    expect(bottomRight.x).toBeLessThanOrEqual(800);
    expect(bottomRight.y).toBeLessThanOrEqual(600);
  });
});

describe("zoomAroundPoint", () => {
  it("keeps the world point under the anchor fixed on screen", () => {
    const viewport = { zoom: 1, panX: 0, panY: 0 };
    const anchor = { x: 300, y: 200 };
    const worldBefore = screenToWorld(viewport, anchor.x, anchor.y);
    const next = zoomAroundPoint(viewport, 2.5, anchor.x, anchor.y);
    const worldAfter = screenToWorld(next, anchor.x, anchor.y);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 6);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 6);
  });
});
