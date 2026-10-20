import type { GeometryResult } from "@/features/puzzle/geometry";
import { PuzzleCanvasRenderer, fitToScreenViewport, clampZoom, zoomAroundPoint } from "@/features/puzzle/rendering";
import type { PieceRuntimeState, RotationDegrees } from "@/features/puzzle/rendering";
import {
  areInSameGroup,
  checkClassicSnap,
  checkFreeNeighborSnap,
  computeClassicProgress,
  createInitialGroups,
  getGroupId,
  getGroupMembers,
  mergeGroups,
  moveGroupBy,
  rotateGroupAround,
} from "@/features/puzzle/interactions";
import type { GroupMap, PiecePosition, PositionMap } from "@/features/puzzle/interactions";
import { mulberry32, hashStringToSeed } from "@/features/puzzle/geometry";
import type { PuzzleMode } from "@/types/firestore";

export interface PuzzleEngineConfig {
  mode: PuzzleMode;
  snapEnabled: boolean;
  rotationEnabled: boolean;
  snapToleranceRatio: number;
  imageWidthPx: number;
  imageHeightPx: number;
}

export interface EngineEvents {
  onProgressChange?: (progress: number) => void;
  onComplete?: () => void;
  /** Fired once a drag ends and a piece/group's position should be persisted (Phase 6 hooks in here). */
  onCommitPositions?: (changed: ReadonlyMap<number, PiecePosition>) => void;
}

/**
 * Composes geometry + rendering + local interaction state into one local
 * (not-yet-networked) puzzle session. The synchronization layer (Phase 6)
 * wraps this: it calls `applyRemotePieceUpdate` for authoritative state
 * from other clients and listens to `onCommitPositions` to persist local
 * drag results, without this class knowing Firebase exists.
 */
export class PuzzleEngine {
  private readonly renderer: PuzzleCanvasRenderer;
  private readonly geometry: GeometryResult;
  private readonly config: PuzzleEngineConfig;
  private readonly events: EngineEvents;
  private readonly pieceWidthPx: number;
  private readonly pieceHeightPx: number;

  private groups: GroupMap;
  private positions: Map<number, PiecePosition>;
  private lockedByOther: Set<number> = new Set();
  private selectedGroupId: string | null = null;
  private drag: {
    pointerId: number;
    groupId: string;
    startScreenX: number;
    startScreenY: number;
    startPositions: PositionMap;
  } | null = null;
  private complete = false;

  constructor(
    canvas: HTMLCanvasElement,
    image: HTMLImageElement | ImageBitmap,
    geometry: GeometryResult,
    config: PuzzleEngineConfig,
    events: EngineEvents = {},
  ) {
    this.geometry = geometry;
    this.config = config;
    this.events = events;
    this.pieceWidthPx = config.imageWidthPx / geometry.cols;
    this.pieceHeightPx = config.imageHeightPx / geometry.rows;
    this.renderer = new PuzzleCanvasRenderer(canvas, {
      canvas,
      geometry,
      image,
      imageWidthPx: config.imageWidthPx,
      imageHeightPx: config.imageHeightPx,
    });
    this.groups = createInitialGroups(geometry.pieces.map((p) => p.pieceId));
    this.positions = new Map();
  }

  /** Deterministic scatter so re-running locally (e.g. after a reload, before the authoritative snapshot arrives) looks stable rather than jarring. */
  scatterPieces(seed: string, areaWidth: number, areaHeight: number): void {
    const rng = mulberry32(hashStringToSeed(`${seed}:scatter`));
    for (const piece of this.geometry.pieces) {
      const x = rng() * Math.max(1, areaWidth - this.pieceWidthPx);
      const y = rng() * Math.max(1, areaHeight - this.pieceHeightPx);
      const rotation = this.config.rotationEnabled
        ? (([0, 90, 180, 270] as const)[Math.floor(rng() * 4)] ?? 0)
        : 0;
      this.positions.set(piece.pieceId, { x, y, rotation });
    }
    this.syncRenderer();
    this.recomputeProgress();
  }

  setAllPositions(positions: ReadonlyMap<number, PiecePosition>): void {
    this.positions = new Map(positions);
    this.syncRenderer();
    this.recomputeProgress();
  }

  getPositions(): PositionMap {
    return this.positions;
  }

  /** Called by the sync layer when an authoritative remote update for a piece/group arrives. */
  applyRemotePieceUpdate(pieceId: number, position: PiecePosition, groupId: string): void {
    if (this.drag?.groupId === groupId) return; // don't fight the local optimistic drag
    this.positions.set(pieceId, position);
    this.groups = new Map(this.groups).set(pieceId, groupId);
    this.syncRenderer();
    this.recomputeProgress();
  }

  setPieceLockedByOther(pieceId: number, locked: boolean): void {
    if (locked) this.lockedByOther.add(pieceId);
    else this.lockedByOther.delete(pieceId);
    this.syncRenderer();
  }

  fitToScreen(screenWidth: number, screenHeight: number): void {
    const viewport = fitToScreenViewport(
      this.config.imageWidthPx,
      this.config.imageHeightPx,
      screenWidth,
      screenHeight,
    );
    this.renderer.setViewport(viewport);
  }

  resetView(screenWidth: number, screenHeight: number): void {
    this.fitToScreen(screenWidth, screenHeight);
  }

  zoomBy(factor: number, anchorScreenX: number, anchorScreenY: number): void {
    const viewport = this.renderer.getViewport();
    this.renderer.setViewport(
      zoomAroundPoint(viewport, viewport.zoom * factor, anchorScreenX, anchorScreenY),
    );
  }

  panBy(dxScreen: number, dyScreen: number): void {
    const viewport = this.renderer.getViewport();
    this.renderer.setViewport({
      ...viewport,
      panX: viewport.panX + dxScreen,
      panY: viewport.panY + dyScreen,
    });
  }

  resizeCanvas(): void {
    this.renderer.syncBackingStoreSize();
  }

  onPointerDown(pointerId: number, screenX: number, screenY: number): void {
    const pieceId = this.renderer.hitTest(screenX, screenY);
    if (pieceId === null) {
      this.selectedGroupId = null;
      return;
    }
    if (this.lockedByOther.has(pieceId)) return;

    const groupId = getGroupId(this.groups, pieceId);
    if (!groupId) return;
    this.selectedGroupId = groupId;
    this.bringGroupToFront(groupId);
    this.drag = {
      pointerId,
      groupId,
      startScreenX: screenX,
      startScreenY: screenY,
      startPositions: new Map(this.positions),
    };
  }

  onPointerMove(pointerId: number, screenX: number, screenY: number): void {
    if (!this.drag || this.drag.pointerId !== pointerId) return;
    const viewport = this.renderer.getViewport();
    const dx = (screenX - this.drag.startScreenX) / viewport.zoom;
    const dy = (screenY - this.drag.startScreenY) / viewport.zoom;

    for (const pieceId of getGroupMembers(this.groups, this.drag.groupId)) {
      const start = this.drag.startPositions.get(pieceId);
      if (!start) continue;
      this.positions.set(pieceId, { ...start, x: start.x + dx, y: start.y + dy });
    }
    this.syncRenderer();
  }

  onPointerUp(pointerId: number): boolean {
    if (!this.drag || this.drag.pointerId !== pointerId) return false;
    const { groupId } = this.drag;
    this.drag = null;
    const didSnap = this.trySnapGroup(groupId);
    this.recomputeProgress();
    this.commitGroup(groupId);
    return didSnap;
  }

  rotateSelection(delta: 90 | -90 | 180): void {
    if (!this.config.rotationEnabled || !this.selectedGroupId) return;
    const members = getGroupMembers(this.groups, this.selectedGroupId);
    if (members.length === 0) return;
    const centroid = this.groupCentroid(members);
    this.positions = new Map(
      rotateGroupAround(this.positions, this.groups, this.selectedGroupId, delta, centroid.x, centroid.y),
    );
    this.syncRenderer();
    this.trySnapGroup(this.selectedGroupId);
    this.recomputeProgress();
    this.commitGroup(this.selectedGroupId);
  }

  private groupCentroid(members: number[]): { x: number; y: number } {
    let sumX = 0;
    let sumY = 0;
    for (const pieceId of members) {
      const position = this.positions.get(pieceId);
      if (!position) continue;
      sumX += position.x + this.pieceWidthPx / 2;
      sumY += position.y + this.pieceHeightPx / 2;
    }
    return { x: sumX / members.length, y: sumY / members.length };
  }

  private bringGroupToFront(groupId: string): void {
    const maxZ = this.renderer.getHighestZIndex();
    for (const pieceId of getGroupMembers(this.groups, groupId)) {
      const position = this.positions.get(pieceId);
      if (!position) continue;
      this.renderer.upsertPiece(this.toRuntimeState(pieceId, position, maxZ + 1, groupId));
    }
  }

  private trySnapGroup(groupId: string): boolean {
    if (!this.config.snapEnabled) return false;
    let snappedAny = false;

    if (this.config.mode === "classic") {
      for (const pieceId of getGroupMembers(this.groups, groupId)) {
        const geometryPiece = this.geometry.pieces.find((p) => p.pieceId === pieceId);
        const position = this.positions.get(pieceId);
        if (!geometryPiece || !position) continue;
        const result = checkClassicSnap(position, geometryPiece, {
          pieceWidth: this.pieceWidthPx,
          pieceHeight: this.pieceHeightPx,
          toleranceRatio: this.config.snapToleranceRatio,
          rotationEnabled: this.config.rotationEnabled,
        });
        if (result.snapped && result.position) {
          const delta = { dx: result.position.x - position.x, dy: result.position.y - position.y };
          this.positions = new Map(moveGroupBy(this.positions, this.groups, groupId, delta.dx, delta.dy));
          snappedAny = true;
        }
      }
    }

    for (const pieceId of getGroupMembers(this.groups, groupId)) {
      const geometryPiece = this.geometry.pieces.find((p) => p.pieceId === pieceId);
      if (!geometryPiece) continue;
      for (const [side, neighborId] of Object.entries(geometryPiece.neighbors) as Array<
        [keyof typeof geometryPiece.neighbors, number | undefined]
      >) {
        if (neighborId === undefined || areInSameGroup(this.groups, pieceId, neighborId)) continue;
        const result = checkFreeNeighborSnap(
          pieceId,
          side,
          neighborId,
          this.positions,
          {
            pieceWidth: this.pieceWidthPx,
            pieceHeight: this.pieceHeightPx,
            toleranceRatio: this.config.snapToleranceRatio,
            rotationEnabled: this.config.rotationEnabled,
          },
        );
        if (result.snapped && result.position) {
          const current = this.positions.get(pieceId);
          if (!current) continue;
          const dx = result.position.x - current.x;
          const dy = result.position.y - current.y;
          this.positions = new Map(moveGroupBy(this.positions, this.groups, groupId, dx, dy));
          this.groups = mergeGroups(this.groups, pieceId, neighborId);
          snappedAny = true;
        }
      }
    }

    this.syncRenderer();
    return snappedAny;
  }

  private commitGroup(groupId: string): void {
    const changed = new Map<number, PiecePosition>();
    for (const pieceId of getGroupMembers(this.groups, groupId)) {
      const position = this.positions.get(pieceId);
      if (position) changed.set(pieceId, position);
    }
    this.events.onCommitPositions?.(changed);
  }

  private recomputeProgress(): void {
    const progress = computeClassicProgress(this.positions, this.geometry.pieces, {
      pieceWidth: this.pieceWidthPx,
      pieceHeight: this.pieceHeightPx,
      toleranceRatio: this.config.snapToleranceRatio,
      rotationEnabled: this.config.rotationEnabled,
    });
    this.events.onProgressChange?.(progress);
    if (progress >= 1 && !this.complete) {
      this.complete = true;
      this.events.onComplete?.();
    }
  }

  private toRuntimeState(
    pieceId: number,
    position: PiecePosition,
    zIndex: number,
    groupId: string,
  ): PieceRuntimeState {
    return {
      pieceId,
      x: position.x,
      y: position.y,
      rotation: position.rotation as RotationDegrees,
      groupId,
      selected: this.selectedGroupId === groupId,
      lockedByOther: this.lockedByOther.has(pieceId),
      zIndex,
    };
  }

  private syncRenderer(): void {
    for (const [pieceId, position] of this.positions) {
      const groupId = getGroupId(this.groups, pieceId) ?? `g${pieceId}`;
      const existing = this.renderer.getPiece(pieceId);
      this.renderer.upsertPiece(
        this.toRuntimeState(pieceId, position, existing?.zIndex ?? 0, groupId),
      );
    }
  }

  destroy(): void {
    this.renderer.destroy();
  }
}

export { clampZoom };
