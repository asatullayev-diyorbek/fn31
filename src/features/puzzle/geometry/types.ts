export interface Point {
  x: number;
  y: number;
}

export type EdgeSide = "top" | "right" | "bottom" | "left";

/**
 * A border edge is a straight line. An internal edge carries a tab (a
 * bulge) whose owner is always the piece with the smaller row/column on
 * that boundary; the neighbor's matching edge is a socket — the exact
 * same curve, traversed in the opposite direction. This is what guarantees
 * gap-free, overlap-free reconstruction (see docs/architecture.md).
 */
export interface EdgeSpec {
  kind: "border" | "internal";
  /** Position of the tab's peak along the edge, in [0.3, 0.7]. */
  knobPosition: number;
  /** Half-width of the tab's influence zone along the edge, in [0.12, 0.2]. */
  knobWidth: number;
  /** Tab bulge depth as a fraction of piece size, in [0.16, 0.24]. */
  knobDepth: number;
  /** +1: tab bulges toward increasing row/col; -1: bulges the other way. */
  sign: 1 | -1;
}

/** A piece's four edges, in the piece's own local unit-square frame ([0,1] x [0,1]). */
export interface PieceEdges {
  top: EdgeSpec;
  right: EdgeSpec;
  bottom: EdgeSpec;
  left: EdgeSpec;
}

export interface PieceGeometry {
  pieceId: number;
  row: number;
  col: number;
  /** Polygon outline in the piece's own local unit-square frame, order: clockwise from top-left. */
  outline: Point[];
  edges: PieceEdges;
  neighbors: Partial<Record<EdgeSide, number>>; // pieceId of each neighbor, if any
}

export interface GeometryParams {
  seed: string;
  geometryVersion: number;
  pieceCount: number;
  imageAspectRatio: number; // width / height, after crop
}

export interface GeometryResult {
  seed: string;
  geometryVersion: number;
  rows: number;
  cols: number;
  pieceWidth: number; // normalized, in units where the full grid is cols x rows
  pieceHeight: number;
  pieces: PieceGeometry[];
}
