export interface Viewport {
  /** World (image-pixel) units per screen (CSS) pixel's inverse — i.e. screen = world * zoom. */
  zoom: number;
  panX: number;
  panY: number;
}

export type RotationDegrees = 0 | 90 | 180 | 270;

/**
 * The render-time, per-piece state. Positions are in "world" space: image
 * pixels of the (post-crop) source image, with (0,0) at the top-left of
 * piece (0,0). This is intentionally the same coordinate system used by
 * the synchronization layer's `PieceState`, so no translation is needed
 * between confirmed state and what gets drawn.
 */
export interface PieceRuntimeState {
  pieceId: number;
  x: number;
  y: number;
  rotation: RotationDegrees;
  groupId: string;
  selected: boolean;
  lockedByOther: boolean;
  zIndex: number;
}
