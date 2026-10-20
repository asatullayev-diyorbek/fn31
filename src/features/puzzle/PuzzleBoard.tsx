import { useCallback, useEffect, useRef, useState } from "react";
import type { GeometryResult } from "@/features/puzzle/geometry";
import { PuzzleEngine } from "@/features/puzzle/engine/PuzzleEngine";
import type { PiecePosition } from "@/features/puzzle/interactions";
import type { PuzzleMode } from "@/types/firestore";
import styles from "./PuzzleBoard.module.css";

export interface PuzzleBoardProps {
  geometry: GeometryResult;
  image: HTMLImageElement;
  imageWidthPx: number;
  imageHeightPx: number;
  mode: PuzzleMode;
  snapEnabled: boolean;
  rotationEnabled: boolean;
  snapToleranceRatio: number;
  seed: string;
  /** Starting positions (e.g. the room's latest Firestore snapshot). When omitted, pieces are scattered locally — used by the offline demo. */
  initialPositions?: ReadonlyMap<number, PiecePosition>;
  onProgressChange?: (progress: number) => void;
  onComplete?: () => void;
  /** The synchronization layer (Phase 6) hooks into these to persist drag-end positions and broadcast live drag previews. */
  onCommitPositions?: (changed: ReadonlyMap<number, PiecePosition>) => void;
  onDragStart?: (pieceIds: readonly number[]) => void;
  onDragMove?: (pieceIds: readonly number[], positions: ReadonlyMap<number, PiecePosition>) => void;
  /** Hands the parent a direct reference to the created engine, so remote snapshot updates can be applied via `engine.applyRemotePieceUpdate(...)`. */
  onEngineReady?: (engine: PuzzleEngine) => void;
}

/**
 * The shared puzzle canvas. Rendering and pointer/keyboard interaction
 * live entirely here; real-time synchronization (Phase 6) is injected via
 * props rather than this component knowing Firebase exists — see
 * `features/puzzle/synchronization` and `PuzzleRoomPage`.
 */
export function PuzzleBoard(props: PuzzleBoardProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PuzzleEngine | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const engine = new PuzzleEngine(
      canvas,
      props.image,
      props.geometry,
      {
        mode: props.mode,
        snapEnabled: props.snapEnabled,
        rotationEnabled: props.rotationEnabled,
        snapToleranceRatio: props.snapToleranceRatio,
        imageWidthPx: props.imageWidthPx,
        imageHeightPx: props.imageHeightPx,
      },
      {
        onProgressChange: props.onProgressChange,
        onComplete: () => {
          setAnnouncement("Pazl muvaffaqiyatli yig'ildi!");
          props.onComplete?.();
        },
        onCommitPositions: props.onCommitPositions,
        onDragStart: props.onDragStart,
        onDragMove: props.onDragMove,
      },
    );
    engineRef.current = engine;
    engine.resizeCanvas();
    if (props.initialPositions && props.initialPositions.size > 0) {
      engine.setAllPositions(props.initialPositions);
    } else {
      engine.scatterPieces(props.seed, container.clientWidth, container.clientHeight);
    }
    engine.fitToScreen(container.clientWidth, container.clientHeight);
    props.onEngineReady?.(engine);

    const resizeObserver = new ResizeObserver(() => {
      engine.resizeCanvas();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      engine.destroy();
      engineRef.current = null;
    };
    // Re-created only when the puzzle identity itself changes; prop
    // callbacks are intentionally not in the dependency list to avoid
    // tearing down the canvas on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.geometry, props.image, props.seed]);

  const toCanvasPoint = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const point = toCanvasPoint(event);
      event.currentTarget.setPointerCapture(event.pointerId);
      engineRef.current?.onPointerDown(event.pointerId, point.x, point.y);
    },
    [toCanvasPoint],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const point = toCanvasPoint(event);
      engineRef.current?.onPointerMove(event.pointerId, point.x, point.y);
    },
    [toCanvasPoint],
  );

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const didSnap = engineRef.current?.onPointerUp(event.pointerId);
    if (didSnap) setAnnouncement("Bo'lak joyiga tushdi.");
  }, []);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (event.key === "r" || event.key === "R") {
      engineRef.current?.rotateSelection(90);
      setAnnouncement("Bo'lak 90 daraja burildi.");
    }
  }, []);

  const zoomIn = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    engineRef.current?.zoomBy(1.2, container.clientWidth / 2, container.clientHeight / 2);
  }, []);

  const zoomOut = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    engineRef.current?.zoomBy(1 / 1.2, container.clientWidth / 2, container.clientHeight / 2);
  }, []);

  const fitToScreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    engineRef.current?.fitToScreen(container.clientWidth, container.clientHeight);
  }, []);

  return (
    <div className={styles.wrapper}>
      <div className={styles.canvasContainer} ref={containerRef}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          role="application"
          tabIndex={0}
          aria-label="Pazl taxtasi. Bo'laklarni sichqoncha yoki barmoq bilan torting, tanlangan bo'lakni aylantirish uchun R tugmasini bosing."
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={handleKeyDown}
        />
      </div>
      <div className={styles.controls} role="toolbar" aria-label="Taxta boshqaruvi">
        <button type="button" className="icon-btn" onClick={zoomOut} aria-label="Kichraytirish">
          −
        </button>
        <button type="button" className="icon-btn" onClick={zoomIn} aria-label="Kattalashtirish">
          +
        </button>
        <button type="button" className="btn btn-secondary" onClick={fitToScreen}>
          Ekranga moslash
        </button>
      </div>
      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
