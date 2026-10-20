import { useEffect, useMemo, useState } from "react";
import { generatePuzzleGeometry } from "@/features/puzzle/geometry";
import { createPlaceholderImage } from "@/features/images/placeholderImage";
import { PuzzleBoard } from "./PuzzleBoard";
import type { PuzzleMode } from "@/types/firestore";
import styles from "./PuzzleDemoPage.module.css";

const IMAGE_WIDTH = 900;
const IMAGE_HEIGHT = 600;

/**
 * Offline, single-user demonstration of the puzzle engine (no Firebase,
 * no network) — used to verify geometry/rendering/interactions actually
 * work in a real browser, independent of the multiplayer backend. Not an
 * end-user-facing route in the final product; kept for development and
 * manual verification (see IMPLEMENTATION_PLAN.md Phase 3).
 */
export function PuzzleDemoPage(): JSX.Element {
  const [mode, setMode] = useState<PuzzleMode>("classic");
  const [pieceCount, setPieceCount] = useState(25);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    createPlaceholderImage(IMAGE_WIDTH, IMAGE_HEIGHT, "PuzzleTogether").then((img) => {
      if (!cancelled) setImage(img);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const geometry = useMemo(
    () =>
      generatePuzzleGeometry({
        seed: `demo:${mode}:${pieceCount}`,
        geometryVersion: 1,
        pieceCount,
        imageAspectRatio: IMAGE_WIDTH / IMAGE_HEIGHT,
      }),
    [mode, pieceCount],
  );

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <label>
          Rejim
          <select value={mode} onChange={(e) => setMode(e.target.value as PuzzleMode)}>
            <option value="classic">Klassik</option>
            <option value="free">Erkin</option>
          </select>
        </label>
        <label>
          Bo&apos;laklar soni
          <select value={pieceCount} onChange={(e) => setPieceCount(Number(e.target.value))}>
            <option value={25}>25</option>
            <option value={49}>49</option>
            <option value={100}>100</option>
          </select>
        </label>
        <span className={styles.progress} data-testid="progress">
          Progress: {Math.round(progress * 100)}%
        </span>
        {complete && <span className={styles.complete}>Tugallandi! 🎉</span>}
      </div>
      {image ? (
        <PuzzleBoard
          geometry={geometry}
          image={image}
          imageWidthPx={IMAGE_WIDTH}
          imageHeightPx={IMAGE_HEIGHT}
          mode={mode}
          snapEnabled
          rotationEnabled={false}
          snapToleranceRatio={0.35}
          seed={`demo:${mode}:${pieceCount}`}
          onProgressChange={setProgress}
          onComplete={() => setComplete(true)}
        />
      ) : (
        <p>Yuklanmoqda…</p>
      )}
    </div>
  );
}
