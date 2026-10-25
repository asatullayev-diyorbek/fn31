import { useCallback, useEffect, useRef, useState } from "react";
import type { GeometryResult } from "@/features/puzzle/geometry";
import { PuzzleEngine } from "@/features/puzzle/engine/PuzzleEngine";
import type { PiecePosition } from "@/features/puzzle/interactions";
import type { PuzzleMode } from "@/types/firestore";
import { registerEngineForE2E } from "@/testHooks";
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
  /** The synchronization layer hooks into these to persist drag-end positions and broadcast live drag previews. */
  onCommitPositions?: (changed: ReadonlyMap<number, PiecePosition>) => void;
  onDragStart?: (pieceIds: readonly number[]) => void;
  onDragMove?: (pieceIds: readonly number[], positions: ReadonlyMap<number, PiecePosition>) => void;
  /** Hands the parent a direct reference to the created engine, so remote snapshot updates can be applied. */
  onEngineReady?: (engine: PuzzleEngine) => void;
}

export function PuzzleBoard(props: PuzzleBoardProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PuzzleEngine | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [announcement, setAnnouncement] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [isPanMode, setIsPanMode] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);

  // Tracks active canvas pan operation (drag on empty background or while holding space / pan tool)
  const panStateRef = useRef<{
    active: boolean;
    pointerId: number;
    lastX: number;
    lastY: number;
  }>({ active: false, pointerId: -1, lastX: 0, lastY: 0 });

  // Tracks multi-touch pointers for pinch zoom & pan
  const touchesRef = useRef<Map<number, { x: number; y: number }>>(new Map());

  // Preserves user's current zoom and pan across any component re-render or piece sync
  const savedViewportRef = useRef<import("@/features/puzzle/rendering/types").Viewport | null>(null);

  // Preserves piece positions across re-renders so pieces never scatter or revert
  const savedPositionsRef = useRef<Map<number, PiecePosition> | null>(null);

  const updateZoomDisplay = useCallback(() => {
    if (engineRef.current) {
      const currentViewport = engineRef.current.getViewport();
      savedViewportRef.current = currentViewport;
      setZoomPercent(Math.round(currentViewport.zoom * 100));
    }
  }, []);

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
        onCommitPositions: (changed) => {
          if (engineRef.current) {
            savedPositionsRef.current = new Map(engineRef.current.getPositions());
          }
          props.onCommitPositions?.(changed);
        },
        onDragStart: props.onDragStart,
        onDragMove: props.onDragMove,
      },
    );
    engineRef.current = engine;
    engine.resizeCanvas();
    if (savedPositionsRef.current && savedPositionsRef.current.size > 0) {
      engine.setAllPositions(savedPositionsRef.current);
    } else if (props.initialPositions && props.initialPositions.size > 0) {
      engine.setAllPositions(props.initialPositions);
      savedPositionsRef.current = new Map(props.initialPositions);
    } else {
      engine.scatterPieces(props.seed, container.clientWidth, container.clientHeight);
      savedPositionsRef.current = new Map(engine.getPositions());
    }

    // If user already had a zoom/pan viewport, restore it! Otherwise, fit to screen.
    if (savedViewportRef.current) {
      engine.setViewport(savedViewportRef.current);
    } else {
      engine.fitToScreen(container.clientWidth, container.clientHeight);
      savedViewportRef.current = engine.getViewport();
    }
    updateZoomDisplay();

    props.onEngineReady?.(engine);
    registerEngineForE2E(engine);

    const resizeObserver = new ResizeObserver(() => {
      engine.resizeCanvas();
      updateZoomDisplay();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      registerEngineForE2E(null);
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.geometry, props.image, props.seed]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement);
      setIsFullscreen(active);
      setTimeout(() => {
        engineRef.current?.resizeCanvas();
        updateZoomDisplay();
      }, 80);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [updateZoomDisplay]);

  // Spacebar pan listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat && document.activeElement?.tagName !== "INPUT") {
        setIsSpacePressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setIsSpacePressed(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const toCanvasPoint = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const point = toCanvasPoint(event);
      event.currentTarget.setPointerCapture(event.pointerId);

      touchesRef.current.set(event.pointerId, point);

      // If multi-touch (e.g. 2 fingers), cancel single drag and let multi-touch pan/zoom take over
      if (touchesRef.current.size >= 2) {
        panStateRef.current.active = false;
        setIsDraggingCanvas(false);
        return;
      }

      // Check if user is panning canvas:
      // 1. Pan Mode is enabled
      // 2. Space key is held down
      // 3. Middle (1) or Right (2) mouse button clicked
      // 4. Clicked on EMPTY area (no piece hit)
      const hitPiece = engineRef.current?.hitTest(point.x, point.y);
      const shouldPan =
        isPanMode ||
        isSpacePressed ||
        event.button === 1 ||
        event.button === 2 ||
        hitPiece === null;

      if (shouldPan) {
        panStateRef.current = {
          active: true,
          pointerId: event.pointerId,
          lastX: point.x,
          lastY: point.y,
        };
        setIsDraggingCanvas(true);
      } else {
        engineRef.current?.onPointerDown(event.pointerId, point.x, point.y);
      }
    },
    [toCanvasPoint, isPanMode, isSpacePressed],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const point = toCanvasPoint(event);

      // Handle 2-finger multi-touch gestures (Pinch-to-zoom + Pan)
      if (touchesRef.current.size === 2 && touchesRef.current.has(event.pointerId)) {
        const previous = touchesRef.current.get(event.pointerId)!;
        touchesRef.current.set(event.pointerId, point);

        const pts = Array.from(touchesRef.current.values());
        const p1 = pts[0];
        const p2 = pts[1];
        if (p1 && p2 && engineRef.current) {
          // Pan with midpoint delta
          const dx = point.x - previous.x;
          const dy = point.y - previous.y;
          engineRef.current.panBy(dx * 0.5, dy * 0.5);

          // Pinch zoom
          const currentDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
          const prevP1 = event.pointerId === Array.from(touchesRef.current.keys())[0] ? previous : p1;
          const prevP2 = event.pointerId === Array.from(touchesRef.current.keys())[1] ? previous : p2;
          const prevDist = Math.hypot(prevP1.x - prevP2.x, prevP1.y - prevP2.y);

          if (prevDist > 0 && Math.abs(currentDist - prevDist) > 1) {
            const factor = currentDist / prevDist;
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            engineRef.current.zoomBy(factor, midX, midY);
            updateZoomDisplay();
          }
        }
        return;
      }

      // Handle single-pointer canvas pan
      if (panStateRef.current.active && panStateRef.current.pointerId === event.pointerId) {
        const dx = point.x - panStateRef.current.lastX;
        const dy = point.y - panStateRef.current.lastY;
        panStateRef.current.lastX = point.x;
        panStateRef.current.lastY = point.y;
        engineRef.current?.panBy(dx, dy);
        if (engineRef.current) {
          savedViewportRef.current = engineRef.current.getViewport();
        }
        return;
      }

      // Otherwise piece drag
      engineRef.current?.onPointerMove(event.pointerId, point.x, point.y);
    },
    [toCanvasPoint, updateZoomDisplay],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      touchesRef.current.delete(event.pointerId);

      if (panStateRef.current.active && panStateRef.current.pointerId === event.pointerId) {
        panStateRef.current.active = false;
        setIsDraggingCanvas(false);
        if (engineRef.current) {
          savedViewportRef.current = engineRef.current.getViewport();
        }
        return;
      }

      const didSnap = engineRef.current?.onPointerUp(event.pointerId);
      if (engineRef.current) {
        savedPositionsRef.current = new Map(engineRef.current.getPositions());
      }
      if (didSnap) setAnnouncement("Bo'lak joyiga tushdi.");
    },
    [],
  );

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      const engine = engineRef.current;
      if (!engine) return;

      const rect = event.currentTarget.getBoundingClientRect();
      const anchorX = event.clientX - rect.left;
      const anchorY = event.clientY - rect.top;

      // Pinch zoom (macOS trackpad) or Ctrl + mouse wheel
      if (event.ctrlKey || event.metaKey) {
        const factor = Math.exp(-event.deltaY * 0.012);
        engine.zoomBy(factor, anchorX, anchorY);
      } else if (Math.abs(event.deltaX) > 2) {
        // Horizontal trackpad gesture -> Pan
        engine.panBy(-event.deltaX, -event.deltaY);
      } else if (event.shiftKey) {
        // Shift + Wheel -> horizontal pan
        engine.panBy(-event.deltaY, 0);
      } else {
        // Standard mouse wheel: Smooth zoom centered on cursor
        const factor = event.deltaY < 0 ? 1.12 : 0.89;
        engine.zoomBy(factor, anchorX, anchorY);
      }
      updateZoomDisplay();
    },
    [updateZoomDisplay],
  );

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (event.key === "r" || event.key === "R") {
      engineRef.current?.rotateSelection(90);
      if (engineRef.current) {
        savedPositionsRef.current = new Map(engineRef.current.getPositions());
      }
      setAnnouncement("Bo'lak 90 daraja burildi.");
    }
  }, []);

  const zoomIn = useCallback(() => {
    const container = containerRef.current;
    if (!container || !engineRef.current) return;
    engineRef.current.zoomBy(1.2, container.clientWidth / 2, container.clientHeight / 2);
    updateZoomDisplay();
  }, [updateZoomDisplay]);

  const zoomOut = useCallback(() => {
    const container = containerRef.current;
    if (!container || !engineRef.current) return;
    engineRef.current.zoomBy(1 / 1.2, container.clientWidth / 2, container.clientHeight / 2);
    updateZoomDisplay();
  }, [updateZoomDisplay]);

  const fitToScreen = useCallback(() => {
    const container = containerRef.current;
    if (!container || !engineRef.current) return;
    engineRef.current.fitToScreen(container.clientWidth, container.clientHeight);
    updateZoomDisplay();
  }, [updateZoomDisplay]);

  const resetToActualSize = useCallback(() => {
    const container = containerRef.current;
    if (!container || !engineRef.current) return;
    engineRef.current.setZoom(1, container.clientWidth / 2, container.clientHeight / 2);
    updateZoomDisplay();
  }, [updateZoomDisplay]);

  const rotatePiece = useCallback(() => {
    engineRef.current?.rotateSelection(90);
    if (engineRef.current) {
      savedPositionsRef.current = new Map(engineRef.current.getPositions());
    }
    setAnnouncement("Bo'lak 90 daraja burildi.");
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const target = wrapperRef.current || containerRef.current || document.documentElement;
    try {
      if (!document.fullscreenElement) {
        if (target.requestFullscreen) {
          await target.requestFullscreen();
        } else if ((target as unknown as { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen) {
          await (target as unknown as { webkitRequestFullscreen: () => Promise<void> }).webkitRequestFullscreen();
        }
        setIsFullscreen(true);
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
        setIsFullscreen(false);
      }
    } catch {
      // Fallback toggling state for constrained environments
      setIsFullscreen((prev) => !prev);
    }
  }, []);

  // Determine canvas cursor
  const getCanvasCursorClass = () => {
    if (isDraggingCanvas) return styles.cursorGrabbing;
    if (isPanMode || isSpacePressed) return styles.cursorPan;
    return styles.cursorGrab;
  };

  return (
    <div
      ref={wrapperRef}
      className={`${styles.wrapper} ${isFullscreen ? styles.wrapperFullscreen : ""}`}
    >
      <div className={styles.canvasContainer} ref={containerRef}>
        <canvas
          ref={canvasRef}
          className={`${styles.canvas} ${getCanvasCursorClass()}`}
          role="application"
          tabIndex={0}
          aria-label="Pazl taxtasi. Bo'laklarni torting, bo'sh joydan taxtani suring, aylantirish uchun R bosing."
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
          onKeyDown={handleKeyDown}
        />
      </div>

      {/* Floating Spacebar / Pan Hint */}
      <div className={styles.floatingHint} aria-hidden="true">
        <span>Canvasni surish: bo&apos;sh joydan torting yoki</span>
        <kbd className={styles.hintKbd}>Space</kbd>
        <span>+ Drag</span>
      </div>

      {/* Apple Floating Island Toolbar */}
      <div className={styles.floatingControls} role="toolbar" aria-label="Taxta boshqaruvi">
        {/* Pan (Hand) mode toggle */}
        <button
          type="button"
          className={`${styles.iconControlBtn} ${isPanMode ? styles.iconControlBtnActive : ""}`}
          onClick={() => setIsPanMode((prev) => !prev)}
          title={isPanMode ? "Pan rejimi o'chirish" : "Pan (qo'l) rejimi: Taxtani har tomonga surish"}
          aria-label="Pan rejimi"
          aria-pressed={isPanMode}
        >
          🖐
        </button>

        <div className={styles.controlDivider} />

        {/* Zoom out */}
        <button
          type="button"
          className={styles.iconControlBtn}
          onClick={zoomOut}
          title="Kichraytirish (Zoom Out)"
          aria-label="Kichraytirish"
        >
          −
        </button>

        {/* Zoom indicator & click to reset to 100% */}
        <button
          type="button"
          className={styles.controlBtn}
          onClick={resetToActualSize}
          title="100% asl o'lchamga qaytish"
          aria-label={`Masshtab ${zoomPercent}%, 100% ga qaytarish`}
        >
          <span className={styles.zoomIndicator}>{zoomPercent}%</span>
        </button>

        {/* Zoom in */}
        <button
          type="button"
          className={styles.iconControlBtn}
          onClick={zoomIn}
          title="Kattalashtirish (Zoom In)"
          aria-label="Kattalashtirish"
        >
          +
        </button>

        <div className={styles.controlDivider} />

        {/* Fit to screen */}
        <button
          type="button"
          className={styles.controlBtn}
          onClick={fitToScreen}
          title="Ekranga moslash"
          aria-label="Ekranga moslash"
        >
          ⛶ Moslash
        </button>

        {/* Rotate piece if rotation enabled */}
        {props.rotationEnabled && (
          <button
            type="button"
            className={styles.controlBtn}
            onClick={rotatePiece}
            title="Tanlangan bo'lakni 90° burish (yoki R tugmasi)"
            aria-label="Burish (R)"
          >
            ↻ 90°
          </button>
        )}

        <div className={styles.controlDivider} />

        {/* Fullscreen Toggle */}
        <button
          type="button"
          className={`${styles.iconControlBtn} ${isFullscreen ? styles.iconControlBtnActive : ""}`}
          onClick={toggleFullscreen}
          title={isFullscreen ? "To'liq ekrandan chiqish (Esc)" : "To'liq ekran (Full Screen)"}
          aria-label={isFullscreen ? "To'liq ekrandan chiqish" : "To'liq ekran"}
          aria-pressed={isFullscreen}
        >
          {isFullscreen ? "✕" : "⤢"}
        </button>
      </div>

      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
