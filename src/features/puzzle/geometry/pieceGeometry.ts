import { deriveEdgePrng } from "./prng";
import { computeGridLayout } from "./grid";
import { createBorderEdgeSpec, createInternalEdgeSpec, sampleEdgeCurve } from "./edgeCurve";
import type {
  EdgeSpec,
  GeometryParams,
  GeometryResult,
  PieceEdges,
  PieceGeometry,
  Point,
} from "./types";

/**
 * Canonical key for the horizontal boundary line between row `r - 1` and
 * row `r`, under column `c`. Both the piece above (bottom edge) and the
 * piece below (top edge) derive their edge spec from this exact key, so
 * they always agree.
 */
function horizontalEdgeKey(r: number, c: number): string {
  return `h:${r}:${c}`;
}

/** Canonical key for the vertical boundary line between col `c - 1` and col `c`, at row `r`. */
function verticalEdgeKey(r: number, c: number): string {
  return `v:${r}:${c}`;
}

function edgeSpecFor(seed: string, key: string, isBorder: boolean): EdgeSpec {
  if (isBorder) return createBorderEdgeSpec();
  return createInternalEdgeSpec(deriveEdgePrng(seed, key));
}

function pieceId(row: number, col: number, cols: number): number {
  return row * cols + col;
}

/**
 * Builds the full polygon outline for one piece in its own local unit
 * square ([0,1] x [0,1]), clockwise starting at the top-left corner, by
 * walking the four shared edge curves. Because every internal edge curve
 * is sampled from a key shared with exactly one neighbor, the two
 * resulting polygons are geometrically identical along that edge — there
 * is no separate "matching" step required.
 */
function buildOutline(edges: PieceEdges): Point[] {
  const outline: Point[] = [];

  for (const { x, y } of sampleEdgeCurve(edges.top)) {
    outline.push({ x, y });
  }
  for (const { x: t, y: offset } of sampleEdgeCurve(edges.right)) {
    outline.push({ x: 1 + offset, y: t });
  }
  const bottomSamples = sampleEdgeCurve(edges.bottom);
  for (let i = bottomSamples.length - 1; i >= 0; i--) {
    const sample = bottomSamples[i];
    if (!sample) continue;
    outline.push({ x: sample.x, y: 1 + sample.y });
  }
  const leftSamples = sampleEdgeCurve(edges.left);
  for (let i = leftSamples.length - 1; i >= 0; i--) {
    const sample = leftSamples[i];
    if (!sample) continue;
    outline.push({ x: sample.y, y: sample.x });
  }

  return outline;
}

export function generatePuzzleGeometry(params: GeometryParams): GeometryResult {
  const { rows, cols } = computeGridLayout(params.pieceCount, params.imageAspectRatio);
  const pieces: PieceGeometry[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const topSpec = edgeSpecFor(params.seed, horizontalEdgeKey(row, col), row === 0);
      const bottomSpec = edgeSpecFor(
        params.seed,
        horizontalEdgeKey(row + 1, col),
        row === rows - 1,
      );
      const leftSpec = edgeSpecFor(params.seed, verticalEdgeKey(row, col), col === 0);
      const rightSpec = edgeSpecFor(
        params.seed,
        verticalEdgeKey(row, col + 1),
        col === cols - 1,
      );

      const edges: PieceEdges = {
        top: topSpec,
        right: rightSpec,
        bottom: bottomSpec,
        left: leftSpec,
      };

      const neighbors: PieceGeometry["neighbors"] = {};
      if (row > 0) neighbors.top = pieceId(row - 1, col, cols);
      if (row < rows - 1) neighbors.bottom = pieceId(row + 1, col, cols);
      if (col > 0) neighbors.left = pieceId(row, col - 1, cols);
      if (col < cols - 1) neighbors.right = pieceId(row, col + 1, cols);

      pieces.push({
        pieceId: pieceId(row, col, cols),
        row,
        col,
        outline: buildOutline(edges),
        edges,
        neighbors,
      });
    }
  }

  return {
    seed: params.seed,
    geometryVersion: params.geometryVersion,
    rows,
    cols,
    pieceWidth: 1,
    pieceHeight: 1,
    pieces,
  };
}
