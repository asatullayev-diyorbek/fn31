import type { GeometryResult } from "@/features/puzzle/geometry";
import { PuzzleCanvasRenderer, fitToScreenViewport, clampZoom, zoomAroundPoint } from "@/features/puzzle/rendering";
import type { PieceRuntimeState, RotationDegrees } from "@/features/puzzle/rendering";
import {
  areInSameGroup,
  checkClassicSnap,
  checkFreeNeighborSnap,
  computeClassicProgress,
  computeFreeProgress,
  createInitialGroups,
  getGroupId,
  getGroupMembers,
  mergeGroups,
  moveGroupBy,
  moveGroupSubsetBy,
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
  /** Fired when a drag begins — the sync layer uses this to attempt a lock acquisition for every member of the group. */
  onDragStart?: (pieceIds: readonly number[]) => void;
  /** Fired on every drag move (the sync layer is expected to throttle its own network writes, e.g. via createThrottledPublisher). */
  onDragMove?: (pieceIds: readonly number[], positions: PositionMap) => void;
}

/**
 * Composes geometry + rendering + local interaction state into one local
 * (not-yet-networked) puzzle session. The synchronization layer (Phase 6)
 * wraps this: it calls `applyRemotePieceUpdate` for authoritative state
 * from other clients and listens to `onCommitPositions` to persist local
 * drag results, without this class knowing Firebase exists.
 */
export class PuzzleEngine {
  private readonly canvas: HTMLCanvasElement;
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
    this.canvas = canvas;
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

  /** Screen (CSS-pixel, canvas-relative) coordinates of a piece's center — used by E2E tests to click exactly on a scattered piece without duplicating hit-test geometry. */
  getPieceScreenCenter(pieceId: number): { x: number; y: number } | undefined {
    const position = this.positions.get(pieceId);
    if (!position) return undefined;
    return this.renderer.worldToScreen(
      position.x + this.pieceWidthPx / 2,
      position.y + this.pieceHeightPx / 2,
    );
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

  getViewport() {
    return this.renderer.getViewport();
  }

  setViewport(viewport: import("@/features/puzzle/rendering/types").Viewport): void {
    this.renderer.setViewport(viewport);
  }

  setReferenceOverlayOpacity(opacity: number): void {
    this.renderer.setReferenceOverlayOpacity(opacity);
  }

  markDirty(): void {
    this.renderer.markDirty();
  }

  getGroupId(pieceId: number): string | undefined {
    return getGroupId(this.groups, pieceId);
  }

  getZoom(): number {
    return this.renderer.getViewport().zoom;
  }

  setZoom(zoom: number, anchorScreenX?: number, anchorScreenY?: number): void {
    const viewport = this.renderer.getViewport();
    const cx = anchorScreenX ?? (this.canvas.clientWidth ? this.canvas.clientWidth / 2 : 0);
    const cy = anchorScreenY ?? (this.canvas.clientHeight ? this.canvas.clientHeight / 2 : 0);
    this.renderer.setViewport(zoomAroundPoint(viewport, zoom, cx, cy));
  }

  hitTest(screenX: number, screenY: number): number | null {
    return this.renderer.hitTest(screenX, screenY);
  }

  /** World (image-space) coordinates for a CSS-pixel point relative to the canvas — the same space piece positions live in, so it's meaningful to any participant regardless of their own zoom/pan. */
  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return this.renderer.screenToWorld(screenX, screenY);
  }

  /** The inverse of screenToWorld — where a world-space point currently lands on screen, given this client's own zoom/pan. */
  worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    return this.renderer.worldToScreen(worldX, worldY);
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
    this.events.onDragStart?.(getGroupMembers(this.groups, groupId));
  }

  onPointerMove(pointerId: number, screenX: number, screenY: number): void {
    if (!this.drag || this.drag.pointerId !== pointerId) return;
    const viewport = this.renderer.getViewport();
    const dx = (screenX - this.drag.startScreenX) / viewport.zoom;
    const dy = (screenY - this.drag.startScreenY) / viewport.zoom;

    const members = getGroupMembers(this.groups, this.drag.groupId);
    for (const pieceId of members) {
      const start = this.drag.startPositions.get(pieceId);
      if (!start) continue;
      this.positions.set(pieceId, { ...start, x: start.x + dx, y: start.y + dy });
    }
    this.syncRenderer();
    this.events.onDragMove?.(members, this.positions);
  }

  onPointerUp(pointerId: number): boolean {
    if (!this.drag || this.drag.pointerId !== pointerId) return false;
    const { groupId } = this.drag;
    const draggedPieceIds = getGroupMembers(this.groups, groupId);
    this.drag = null;
    const didSnap = this.trySnapGroup(groupId, draggedPieceIds);
    this.recomputeProgress();
    this.commitGroup(draggedPieceIds);
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
    this.trySnapGroup(this.selectedGroupId, members);
    this.recomputeProgress();
    this.commitGroup(members);
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

  private trySnapGroup(groupId: string, draggedPieceIds: readonly number[]): boolean {
    if (!this.config.snapEnabled) return false;
    let snappedAny = false;
    const allowedToMove = new Set(draggedPieceIds);

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
          // A prior merge this same call may have renamed (discarded) `groupId` —
          // re-resolve this piece's current group id rather than using the
          // outer-loop's now possibly-stale one.
          const currentGroupId = getGroupId(this.groups, pieceId) ?? groupId;
          // Restricted to `draggedPieceIds`: if an earlier merge in this same call
          // already pulled a previously-placed, stationary neighbor into this
          // group, `currentGroupId`'s members now include that neighbor's whole
          // cluster too — but only the originally-dragged pieces may actually
          // move (see moveGroupSubsetBy's docstring for why moving the rest would
          // silently revert on the next sync).
          this.positions = new Map(moveGroupSubsetBy(this.positions, this.groups, currentGroupId, allowedToMove, dx, dy));
          this.groups = mergeGroups(this.groups, pieceId, neighborId);
          snappedAny = true;
        }
      }
    }

    this.syncRenderer();
    return snappedAny;
  }

  /**
   * `pieceIds` is the set dragged/rotated in this gesture. Only *these*
   * pieces' positions are sent — never other members of whatever group they
   * end up merged into. Those stationary pieces didn't move, so this
   * client's local `this.positions` for them is already stale-safe to leave
   * untouched; broadcasting them anyway would mean re-sending this client's
   * (possibly out-of-date) copy of data it never actually changed, which has
   * previously overwritten another client's more current value for a piece
   * this gesture didn't even touch.
   *
   * This relies on progress/completion being computed from *positions*, not
   * from group-id labels (see computeFreeProgress) — a stationary piece's
   * group id can lag behind the dragged piece's newly merged label without
   * that ever being treated as "incorrect"; only actual position/adjacency
   * is.
   */
  private commitGroup(pieceIds: readonly number[]): void {
    const changed = new Map<number, PiecePosition>();
    for (const pieceId of pieceIds) {
      const position = this.positions.get(pieceId);
      if (position) changed.set(pieceId, position);
    }
    this.events.onCommitPositions?.(changed);
  }

  private recomputeProgress(): void {
    // Free mode pieces never need to reach their absolute classic-grid slot —
    // only to be joined to every image-adjacent neighbor — so it has its own
    // position-based progress measure (see computeFreeProgress for why it
    // checks actual positions rather than group-id labels).
    const snapConfig = {
      pieceWidth: this.pieceWidthPx,
      pieceHeight: this.pieceHeightPx,
      toleranceRatio: this.config.snapToleranceRatio,
      rotationEnabled: this.config.rotationEnabled,
    };
    const progress =
      this.config.mode === "classic"
        ? computeClassicProgress(this.positions, this.geometry.pieces, snapConfig)
        : computeFreeProgress(this.positions, this.geometry.pieces, snapConfig);
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
