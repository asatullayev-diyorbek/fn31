import type { GeometryResult } from "@/features/puzzle/geometry";
import { createPieceClipPath } from "./pieceClipPath";
import { screenToWorld, worldToScreen } from "./viewport";
import type { PieceRuntimeState, Viewport } from "./types";

export interface RendererSetup {
  canvas: HTMLCanvasElement;
  geometry: GeometryResult;
  image: HTMLImageElement | ImageBitmap;
  /** Full post-crop image pixel dimensions. */
  imageWidthPx: number;
  imageHeightPx: number;
}

/**
 * Canvas 2D renderer for the puzzle board. Owns the backing-store sizing
 * (devicePixelRatio-aware), the viewport transform, and per-piece clip
 * paths. Redraws are coalesced onto `requestAnimationFrame` via a dirty
 * flag so dragging doesn't schedule more than one paint per frame.
 */
export class PuzzleCanvasRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private geometry: GeometryResult;
  private image: HTMLImageElement | ImageBitmap;
  private readonly imageWidthPx: number;
  private readonly imageHeightPx: number;
  private readonly pieceWidthPx: number;
  private readonly pieceHeightPx: number;
  private readonly clipPaths: Map<number, Path2D> = new Map();
  private pieces: Map<number, PieceRuntimeState> = new Map();
  private viewport: Viewport = { zoom: 1, panX: 0, panY: 0 };
  private dirty = true;
  private rafHandle: number | null = null;
  private referenceOpacity = 0;

  constructor(private readonly canvas: HTMLCanvasElement, setup: RendererSetup) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
    this.geometry = setup.geometry;
    this.image = setup.image;
    this.imageWidthPx = setup.imageWidthPx;
    this.imageHeightPx = setup.imageHeightPx;
    this.pieceWidthPx = setup.imageWidthPx / setup.geometry.cols;
    this.pieceHeightPx = setup.imageHeightPx / setup.geometry.rows;
    this.buildClipPaths();
  }

  private buildClipPaths(): void {
    this.clipPaths.clear();
    for (const piece of this.geometry.pieces) {
      this.clipPaths.set(
        piece.pieceId,
        createPieceClipPath(piece.outline, this.pieceWidthPx, this.pieceHeightPx),
      );
    }
  }

  setViewport(viewport: Viewport): void {
    this.viewport = viewport;
    this.markDirty();
  }

  getViewport(): Viewport {
    return this.viewport;
  }

  setReferenceOverlayOpacity(opacity: number): void {
    this.referenceOpacity = Math.max(0, Math.min(1, opacity));
    this.markDirty();
  }

  /** Resizes the backing store to the canvas's current CSS size * devicePixelRatio. */
  syncBackingStoreSize(): void {
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = this.canvas.clientWidth;
    const cssHeight = this.canvas.clientHeight;
    const targetWidth = Math.max(1, Math.round(cssWidth * dpr));
    const targetHeight = Math.max(1, Math.round(cssHeight * dpr));
    if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
      this.canvas.width = targetWidth;
      this.canvas.height = targetHeight;
    }
    this.markDirty();
  }

  upsertPiece(state: PieceRuntimeState): void {
    this.pieces.set(state.pieceId, state);
    this.markDirty();
  }

  setAllPieces(states: PieceRuntimeState[]): void {
    this.pieces = new Map(states.map((s) => [s.pieceId, s]));
    this.markDirty();
  }

  getPiece(pieceId: number): PieceRuntimeState | undefined {
    return this.pieces.get(pieceId);
  }

  getHighestZIndex(): number {
    let max = 0;
    for (const piece of this.pieces.values()) max = Math.max(max, piece.zIndex);
    return max;
  }

  /**
   * Hit-tests a CSS-pixel point (relative to the canvas element, i.e. raw
   * pointer-event coordinates) against pieces, front-to-back. Encapsulates
   * the devicePixelRatio + viewport + per-piece transform so callers never
   * need to replicate `draw()`'s transform stack themselves. Not
   * exercised by Vitest/jsdom (no real Canvas 2D context there) — see
   * AGENT.md §6 and IMPLEMENTATION_PLAN.md Phase 7 for how this is
   * actually verified (manual + Playwright, in a real browser).
   */
  hitTest(cssX: number, cssY: number): number | null {
    const dpr = window.devicePixelRatio || 1;
    const ordered = [...this.pieces.values()].sort((a, b) => b.zIndex - a.zIndex);
    for (const piece of ordered) {
      const clipPath = this.clipPaths.get(piece.pieceId);
      if (!clipPath) continue;
      this.ctx.save();
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.ctx.translate(this.viewport.panX, this.viewport.panY);
      this.ctx.scale(this.viewport.zoom, this.viewport.zoom);
      this.ctx.translate(piece.x, piece.y);
      this.ctx.translate(this.pieceWidthPx / 2, this.pieceHeightPx / 2);
      this.ctx.rotate((piece.rotation * Math.PI) / 180);
      this.ctx.translate(-this.pieceWidthPx / 2, -this.pieceHeightPx / 2);
      const hit = this.ctx.isPointInPath(clipPath, cssX * dpr, cssY * dpr);
      this.ctx.restore();
      if (hit) return piece.pieceId;
    }
    return null;
  }

  worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    return worldToScreen(this.viewport, worldX, worldY);
  }

  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return screenToWorld(this.viewport, screenX, screenY);
  }

  markDirty(): void {
    this.dirty = true;
    if (this.rafHandle === null) {
      this.rafHandle = requestAnimationFrame(() => {
        this.rafHandle = null;
        if (this.dirty) this.draw();
      });
    }
  }

  destroy(): void {
    if (this.rafHandle !== null) cancelAnimationFrame(this.rafHandle);
  }

  private draw(): void {
    this.dirty = false;
    const dpr = window.devicePixelRatio || 1;
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width / dpr, this.canvas.height / dpr);

    ctx.translate(this.viewport.panX, this.viewport.panY);
    ctx.scale(this.viewport.zoom, this.viewport.zoom);

    // Target board mat & subtle outline indicating the puzzle assembly area
    ctx.save();
    ctx.fillStyle = "rgba(15, 23, 42, 0.45)";
    ctx.fillRect(0, 0, this.imageWidthPx, this.imageHeightPx);
    ctx.strokeStyle = "rgba(56, 189, 248, 0.28)";
    ctx.lineWidth = 1.5 / this.viewport.zoom;
    ctx.setLineDash([8 / this.viewport.zoom, 6 / this.viewport.zoom]);
    ctx.strokeRect(0, 0, this.imageWidthPx, this.imageHeightPx);
    ctx.restore();

    if (this.referenceOpacity > 0) {
      ctx.save();
      ctx.globalAlpha = this.referenceOpacity;
      ctx.drawImage(this.image, 0, 0, this.imageWidthPx, this.imageHeightPx);
      ctx.restore();
    }

    const ordered = [...this.pieces.values()].sort((a, b) => a.zIndex - b.zIndex);
    for (const piece of ordered) {
      this.drawPiece(piece);
    }
    ctx.restore();
  }

  private drawPiece(piece: PieceRuntimeState): void {
    const geometryPiece = this.geometry.pieces[piece.pieceId];
    const clipPath = this.clipPaths.get(piece.pieceId);
    if (!geometryPiece || !clipPath) return;

    const ctx = this.ctx;
    ctx.save();
    ctx.translate(piece.x, piece.y);
    ctx.translate(this.pieceWidthPx / 2, this.pieceHeightPx / 2);
    ctx.rotate((piece.rotation * Math.PI) / 180);
    ctx.translate(-this.pieceWidthPx / 2, -this.pieceHeightPx / 2);

    ctx.clip(clipPath);

    const sourceX = geometryPiece.col * this.pieceWidthPx;
    const sourceY = geometryPiece.row * this.pieceHeightPx;
    ctx.drawImage(this.image, -sourceX, -sourceY, this.imageWidthPx, this.imageHeightPx);

    if (piece.selected || piece.lockedByOther) {
      ctx.strokeStyle = piece.lockedByOther ? "#ef4444" : "#2563eb";
      ctx.lineWidth = 2 / this.viewport.zoom;
      ctx.stroke(clipPath);
    }

    ctx.restore();
  }
}
