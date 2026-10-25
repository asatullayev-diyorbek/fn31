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
  progress?: number;
  initialPositions?: ReadonlyMap<number, PiecePosition>;
  onProgressChange?: (progress: number) => void;
  onComplete?: () => void;
  onCommitPositions?: (changed: ReadonlyMap<number, PiecePosition>) => void;
  onDragStart?: (pieceIds: readonly number[]) => void;
  onDragMove?: (pieceIds: readonly number[], positions: ReadonlyMap<number, PiecePosition>) => void;
  onEngineReady?: (engine: PuzzleEngine) => void;
  /** Fired (already throttled) on pointer movement over the board, in world/image-space coordinates — the sync layer broadcasts this as live cursor presence. */
  onCursorMove?: (worldX: number, worldY: number) => void;
}

const CURSOR_BROADCAST_THROTTLE_MS = 50; // ~20 Hz ceiling, same budget as piece live-drag (see src/app/config.ts)

export function PuzzleBoard(props: PuzzleBoardProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PuzzleEngine | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [announcement, setAnnouncement] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [activeTool, setActiveTool] = useState<"pan" | "select">("select");
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [isGhostActive, setIsGhostActive] = useState(false);
  const [showReferenceModal, setShowReferenceModal] = useState(false);

  // Viewport rectangle metrics for minimap indicator
  const [viewportRect, setViewportRect] = useState({ left: 0, top: 0, width: 100, height: 100 });

  const panStateRef = useRef<{
    active: boolean;
    pointerId: number;
    lastX: number;
    lastY: number;
  }>({ active: false, pointerId: -1, lastX: 0, lastY: 0 });

  const touchesRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const savedViewportRef = useRef<import("@/features/puzzle/rendering/types").Viewport | null>(null);
  const savedPositionsRef = useRef<Map<number, PiecePosition> | null>(null);
  const lastCursorBroadcastAtRef = useRef(0);

  const updateMetrics = useCallback(() => {
    const engine = engineRef.current;
    const container = containerRef.current;
    if (!engine || !container) return;

    const currentViewport = engine.getViewport();
    savedViewportRef.current = currentViewport;
    setZoomPercent(Math.round(currentViewport.zoom * 100));

    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const iw = props.imageWidthPx || 1;
    const ih = props.imageHeightPx || 1;

    // Visible canvas rectangle in world coordinates
    const worldX0 = -currentViewport.panX / currentViewport.zoom;
    const worldY0 = -currentViewport.panY / currentViewport.zoom;
    const worldW = cw / currentViewport.zoom;
    const worldH = ch / currentViewport.zoom;

    // Percentage relative to full puzzle image
    const left = Math.max(0, Math.min(100, (worldX0 / iw) * 100));
    const top = Math.max(0, Math.min(100, (worldY0 / ih) * 100));
    const width = Math.max(6, Math.min(100 - left, (worldW / iw) * 100));
    const height = Math.max(6, Math.min(100 - top, (worldH / ih) * 100));

    setViewportRect({ left, top, width, height });
  }, [props.imageWidthPx, props.imageHeightPx]);

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

    if (savedViewportRef.current) {
      engine.setViewport(savedViewportRef.current);
    } else {
      engine.fitToScreen(container.clientWidth, container.clientHeight);
      savedViewportRef.current = engine.getViewport();
    }
    updateMetrics();

    props.onEngineReady?.(engine);
    registerEngineForE2E(engine);

    const resizeObserver = new ResizeObserver(() => {
      engine.resizeCanvas();
      updateMetrics();
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

  useEffect(() => {
    const handleFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement);
      setIsFullscreen(active);
      setTimeout(() => {
        engineRef.current?.resizeCanvas();
        updateMetrics();
      }, 80);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [updateMetrics]);

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

      if (touchesRef.current.size >= 2) {
        panStateRef.current.active = false;
        setIsDraggingCanvas(false);
        return;
      }

      const hitPiece = engineRef.current?.hitTest(point.x, point.y);
      const shouldPan =
        activeTool === "pan" ||
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
    [toCanvasPoint, activeTool, isSpacePressed],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const point = toCanvasPoint(event);

      if (props.onCursorMove && engineRef.current) {
        const now = performance.now();
        if (now - lastCursorBroadcastAtRef.current >= CURSOR_BROADCAST_THROTTLE_MS) {
          lastCursorBroadcastAtRef.current = now;
          const world = engineRef.current.screenToWorld(point.x, point.y);
          props.onCursorMove(world.x, world.y);
        }
      }

      if (touchesRef.current.size === 2 && touchesRef.current.has(event.pointerId)) {
        const previous = touchesRef.current.get(event.pointerId)!;
        touchesRef.current.set(event.pointerId, point);

        const pts = Array.from(touchesRef.current.values());
        const p1 = pts[0];
        const p2 = pts[1];
        if (p1 && p2 && engineRef.current) {
          const dx = point.x - previous.x;
          const dy = point.y - previous.y;
          engineRef.current.panBy(dx * 0.5, dy * 0.5);

          const currentDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
          const prevP1 = event.pointerId === Array.from(touchesRef.current.keys())[0] ? previous : p1;
          const prevP2 = event.pointerId === Array.from(touchesRef.current.keys())[1] ? previous : p2;
          const prevDist = Math.hypot(prevP1.x - prevP2.x, prevP1.y - prevP2.y);

          if (prevDist > 0 && Math.abs(currentDist - prevDist) > 1) {
            const factor = currentDist / prevDist;
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            engineRef.current.zoomBy(factor, midX, midY);
            updateMetrics();
          }
        }
        return;
      }

      if (panStateRef.current.active && panStateRef.current.pointerId === event.pointerId) {
        const dx = point.x - panStateRef.current.lastX;
        const dy = point.y - panStateRef.current.lastY;
        panStateRef.current.lastX = point.x;
        panStateRef.current.lastY = point.y;
        engineRef.current?.panBy(dx, dy);
        if (engineRef.current) {
          savedViewportRef.current = engineRef.current.getViewport();
          updateMetrics();
        }
        return;
      }

      engineRef.current?.onPointerMove(event.pointerId, point.x, point.y);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depending on the whole `props` object (the lint rule's suggested fix) would recreate this callback on every unrelated prop change; props.onCursorMove already covers the one prop this callback actually reads
    [toCanvasPoint, updateMetrics, props.onCursorMove],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      touchesRef.current.delete(event.pointerId);

      if (panStateRef.current.active && panStateRef.current.pointerId === event.pointerId) {
        panStateRef.current.active = false;
        setIsDraggingCanvas(false);
        if (engineRef.current) {
          savedViewportRef.current = engineRef.current.getViewport();
          updateMetrics();
        }
        return;
      }

      const didSnap = engineRef.current?.onPointerUp(event.pointerId);
      if (engineRef.current) {
        savedPositionsRef.current = new Map(engineRef.current.getPositions());
      }
      if (didSnap) setAnnouncement("Bo'lak joyiga tushdi.");
    },
    [updateMetrics],
  );

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      const engine = engineRef.current;
      if (!engine) return;

      const rect = event.currentTarget.getBoundingClientRect();
      const anchorX = event.clientX - rect.left;
      const anchorY = event.clientY - rect.top;

      if (event.ctrlKey || event.metaKey) {
        const factor = Math.exp(-event.deltaY * 0.012);
        engine.zoomBy(factor, anchorX, anchorY);
      } else if (Math.abs(event.deltaX) > 2) {
        engine.panBy(-event.deltaX, -event.deltaY);
      } else if (event.shiftKey) {
        engine.panBy(-event.deltaY, 0);
      } else {
        const factor = event.deltaY < 0 ? 1.12 : 0.89;
        engine.zoomBy(factor, anchorX, anchorY);
      }
      updateMetrics();
    },
    [updateMetrics],
  );

  const rotateSelectionBy = useCallback((delta: 90 | -90 | 180) => {
    engineRef.current?.rotateSelection(delta);
    if (engineRef.current) {
      savedPositionsRef.current = new Map(engineRef.current.getPositions());
    }
    setAnnouncement(`Bo'lak ${delta}° burildi.`);
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLCanvasElement>) => {
      if (event.key === "r" || event.key === "R") {
        rotateSelectionBy(90);
      }
    },
    [rotateSelectionBy],
  );

  const zoomIn = useCallback(() => {
    const container = containerRef.current;
    if (!container || !engineRef.current) return;
    engineRef.current.zoomBy(1.2, container.clientWidth / 2, container.clientHeight / 2);
    updateMetrics();
  }, [updateMetrics]);

  const zoomOut = useCallback(() => {
    const container = containerRef.current;
    if (!container || !engineRef.current) return;
    engineRef.current.zoomBy(1 / 1.2, container.clientWidth / 2, container.clientHeight / 2);
    updateMetrics();
  }, [updateMetrics]);

  const fitToScreen = useCallback(() => {
    const container = containerRef.current;
    if (!container || !engineRef.current) return;
    engineRef.current.fitToScreen(container.clientWidth, container.clientHeight);
    updateMetrics();
  }, [updateMetrics]);

  const resetToActualSize = useCallback(() => {
    const container = containerRef.current;
    if (!container || !engineRef.current) return;
    engineRef.current.setZoom(1, container.clientWidth / 2, container.clientHeight / 2);
    updateMetrics();
  }, [updateMetrics]);

  const toggleGhost = useCallback(() => {
    setIsGhostActive((prev) => {
      const next = !prev;
      engineRef.current?.setReferenceOverlayOpacity(next ? 0.26 : 0);
      return next;
    });
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
      setIsFullscreen((prev) => !prev);
    }
  }, []);

  // Click on minimap navigates to that portion of the puzzle
  const handleMinimapClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const clickXPercent = (event.clientX - rect.left) / rect.width;
      const clickYPercent = (event.clientY - rect.top) / rect.height;

      const targetWorldX = clickXPercent * props.imageWidthPx;
      const targetWorldY = clickYPercent * props.imageHeightPx;

      const container = containerRef.current;
      const engine = engineRef.current;
      if (!container || !engine) return;

      const vp = engine.getViewport();
      const newPanX = container.clientWidth / 2 - targetWorldX * vp.zoom;
      const newPanY = container.clientHeight / 2 - targetWorldY * vp.zoom;

      engine.setViewport({ zoom: vp.zoom, panX: newPanX, panY: newPanY });
      updateMetrics();
    },
    [props.imageWidthPx, props.imageHeightPx, updateMetrics],
  );

  const getCanvasCursorClass = () => {
    if (isDraggingCanvas) return styles.cursorGrabbing;
    if (activeTool === "pan" || isSpacePressed) return styles.cursorPan;
    return styles.cursorGrab;
  };

  const progressPercent = Math.round((props.progress ?? 0) * 100);

  return (
    <div
      ref={wrapperRef}
      className={`${styles.wrapper} ${isFullscreen ? styles.wrapperFullscreen : ""}`}
    >
      {/* 1. TOP CANVAS TOOLBAR */}
      <div className={styles.topToolbar} role="toolbar" aria-label="Kanvas asosiy boshqaruvi">
        {/* Left tool pills */}
        <div className={styles.toolGroup}>
          {/* Surish (Pan / Hand tool) */}
          <button
            type="button"
            className={`${styles.toolBtn} ${activeTool === "pan" ? styles.toolBtnActive : ""}`}
            onClick={() => setActiveTool("pan")}
            title="Surish (Pan rejimi: taxtani erkin surish)"
            aria-pressed={activeTool === "pan"}
          >
            <span className={styles.toolIcon}>✋</span>
            <span>Surish</span>
          </button>

          {/* Tanlash (Select tool) */}
          <button
            type="button"
            className={`${styles.toolBtn} ${activeTool === "select" ? styles.toolBtnActive : ""}`}
            onClick={() => setActiveTool("select")}
            title="Tanlash (Bo'laklarni surish va yig'ish)"
            aria-pressed={activeTool === "select"}
          >
            <span className={styles.toolIcon}>↖</span>
            <span>Tanlash</span>
          </button>

          {/* Aylantirish */}
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => rotateSelectionBy(90)}
            title="Tanlangan bo'lakni 90° aylantirish (R)"
          >
            <span className={styles.toolIcon}>🔄</span>
            <span>Aylantirish</span>
          </button>

          {/* Masshtab */}
          <button
            type="button"
            className={styles.toolBtn}
            onClick={zoomIn}
            title="Masshtabni oshirish"
          >
            <span className={styles.toolIcon}>🔍</span>
            <span>Masshtab</span>
          </button>

          {/* Panorama */}
          <button
            type="button"
            className={styles.toolBtn}
            onClick={fitToScreen}
            title="Panorama (Ekranga to'liq moslash)"
          >
            <span className={styles.toolIcon}>✥</span>
            <span>Panorama</span>
          </button>
        </div>

        {/* Right utility pills */}
        <div className={styles.toolGroup}>
          {/* Asl rasm */}
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => setShowReferenceModal(true)}
            title="Pazlning to'liq asl rasmini ko'rish"
          >
            <span className={styles.toolIcon}>💡</span>
            <span>Asl rasm</span>
          </button>

          {/* Ko'rsatish (Ghost guide overlay) */}
          <button
            type="button"
            className={`${styles.toolBtn} ${isGhostActive ? styles.toolBtnActive : ""}`}
            onClick={toggleGhost}
            title={isGhostActive ? "Asl rasm soya rejimini yashirish" : "Asl rasmni taxta ostida ko'rsatish"}
            aria-pressed={isGhostActive}
          >
            <span className={styles.toolIcon}>👁</span>
            <span>Ko&apos;rsatish</span>
          </button>

          {/* To'liq ekran */}
          <button
            type="button"
            className={`${styles.toolBtn} ${isFullscreen ? styles.toolBtnActive : ""}`}
            onClick={toggleFullscreen}
            title={isFullscreen ? "To'liq ekrandan chiqish (Esc)" : "To'liq ekran rejimiga o'tish"}
            aria-pressed={isFullscreen}
          >
            <span className={styles.toolIcon}>⛶</span>
            <span>To&apos;liq ekran</span>
          </button>
        </div>
      </div>

      {/* 2. CANVAS CONTAINER */}
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

        {/* TOP-RIGHT MINIMAP WIDGET */}
        <div
          className={styles.minimapWidget}
          onClick={handleMinimapClick}
          title="Minimap: bosing va xohlagan qismga o'ting, ikki marta bosib to'liq ko'ring"
          onDoubleClick={() => setShowReferenceModal(true)}
          role="region"
          aria-label="Pazl mini xaritasi"
        >
          <img src={props.image.src} alt="Minimap preview" className={styles.minimapImg} />
          {/* Cyan Viewport Indicator Box */}
          <div
            className={styles.minimapViewportBox}
            style={{
              left: `${viewportRect.left}%`,
              top: `${viewportRect.top}%`,
              width: `${viewportRect.width}%`,
              height: `${viewportRect.height}%`,
            }}
          />
          {/* Progress Badge */}
          <div className={styles.minimapBadge}>{progressPercent}%</div>
        </div>

        {/* 3. BOTTOM FLOATING ISLAND TOOLBAR */}
        <div className={styles.floatingControls} role="toolbar" aria-label="Masshtab va burish boshqaruvi">
          {/* Undo / Rotate Left */}
          <button
            type="button"
            className={styles.iconControlBtn}
            onClick={() => rotateSelectionBy(-90)}
            title="Chapga burish (-90°)"
            aria-label="Chapga burish"
          >
            ↩
          </button>

          {/* Redo / Rotate Right */}
          <button
            type="button"
            className={styles.iconControlBtn}
            onClick={() => rotateSelectionBy(90)}
            title="O'ngga burish (+90°)"
            aria-label="O'ngga burish"
          >
            ↪
          </button>

          <div className={styles.controlDivider} />

          {/* Zoom Out */}
          <button
            type="button"
            className={styles.iconControlBtn}
            onClick={zoomOut}
            title="Kichraytirish"
            aria-label="Kichraytirish"
          >
            −
          </button>

          {/* Zoom Percentage */}
          <button
            type="button"
            className={styles.controlBtn}
            onClick={resetToActualSize}
            title="100% asl o'lchamga qaytish"
            aria-label={`Masshtab ${zoomPercent}%, 100% ga qaytarish`}
          >
            <span className={styles.zoomIndicator}>{zoomPercent}%</span>
          </button>

          {/* Zoom In */}
          <button
            type="button"
            className={styles.iconControlBtn}
            onClick={zoomIn}
            title="Kattalashtirish"
            aria-label="Kattalashtirish"
          >
            +
          </button>

          <div className={styles.controlDivider} />

          {/* Moslash (Fit to screen) */}
          <button
            type="button"
            className={styles.controlBtn}
            onClick={fitToScreen}
            title="Ekranga moslash"
            aria-label="Ekranga moslash"
          >
            ⛶ Moslash
          </button>

          {/* Reset 100% */}
          <button
            type="button"
            className={styles.iconControlBtn}
            onClick={resetToActualSize}
            title="100% o'lcham"
            aria-label="100% o'lcham"
          >
            ⛶
          </button>
        </div>
      </div>

      {/* 4. REFERENCE IMAGE MODAL */}
      {showReferenceModal && (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="reference-title"
          onClick={() => setShowReferenceModal(false)}
        >
          <div className={styles.referenceModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 id="reference-title" className={styles.modalTitle}>Asl rasm namoyishi</h2>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setShowReferenceModal(false)}
                aria-label="Yopish"
              >
                ✕
              </button>
            </div>
            <div className={styles.referenceImgContainer}>
              <img src={props.image.src} alt="Asl to'liq rasm" className={styles.referenceImg} />
            </div>
            <div className={styles.modalFooter}>
              <span>{props.imageWidthPx} × {props.imageHeightPx} px · {props.geometry.pieces.length} bo&apos;lak</span>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowReferenceModal(false)}
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
