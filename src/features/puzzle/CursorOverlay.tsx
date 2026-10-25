import { useEffect, useRef } from "react";
import type { PuzzleEngine } from "@/features/puzzle/engine/PuzzleEngine";
import styles from "./CursorOverlay.module.css";

export interface RemoteCursor {
  uid: string;
  displayName: string;
  /** World/image-space coordinates — the same space piece positions live in. */
  x: number;
  y: number;
}

export interface CursorOverlayProps {
  cursors: ReadonlyMap<string, RemoteCursor>;
  /** A ref rather than the engine instance itself — screen position must track this client's *own*, continuously-changing pan/zoom, which doesn't trigger a React re-render. */
  engineRef: React.RefObject<PuzzleEngine | null>;
}

const CURSOR_COLORS = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

function colorForUid(uid: string): string {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) hash = (hash * 31 + uid.charCodeAt(i)) | 0;
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length] ?? CURSOR_COLORS[0]!;
}

/**
 * Renders every other participant's live pointer as a small floating label,
 * positioned via direct DOM transform writes on a requestAnimationFrame loop
 * rather than React state — screen position depends on this client's own
 * pan/zoom, which can change every frame while cursor *data* only arrives a
 * few times a second, so re-rendering React on every frame just to track the
 * viewport would be wasteful.
 */
export function CursorOverlay({ cursors, engineRef }: CursorOverlayProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let rafHandle: number;
    const tick = (): void => {
      const engine = engineRef.current;
      const container = containerRef.current;
      if (engine && container) {
        for (const cursor of cursors.values()) {
          const el = container.querySelector<HTMLDivElement>(`[data-cursor-uid="${CSS.escape(cursor.uid)}"]`);
          if (!el) continue;
          const screen = engine.worldToScreen(cursor.x, cursor.y);
          el.style.transform = `translate(${screen.x}px, ${screen.y}px)`;
        }
      }
      rafHandle = requestAnimationFrame(tick);
    };
    rafHandle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafHandle);
  }, [cursors, engineRef]);

  return (
    <div ref={containerRef} className={styles.overlay} aria-hidden="true">
      {[...cursors.values()].map((cursor) => (
        <div key={cursor.uid} data-cursor-uid={cursor.uid} className={styles.cursor}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={styles.cursorIcon}>
            <path
              d="M3 2L17 9.5L10.5 11L8 17.5L3 2Z"
              fill={colorForUid(cursor.uid)}
              stroke="rgba(0,0,0,0.35)"
              strokeWidth="1"
              strokeLinejoin="round"
            />
          </svg>
          <span className={styles.label} style={{ background: colorForUid(cursor.uid) }}>
            {cursor.displayName}
          </span>
        </div>
      ))}
    </div>
  );
}
