import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthProvider";
import { computeRecommendedImages, fetchGalleryImages, type GalleryImage } from "@/features/images/gallery";
import { uploadPuzzleImage, validateImageFile } from "@/features/images/uploadImage";
import { mediaUrl } from "@/lib/api";
import { DIFFICULTY_PRESETS, createRoom, validatePieceCount } from "@/features/rooms/roomsApi";
import { PUZZLE_PIECE_COUNT_MAX, PUZZLE_PIECE_COUNT_MIN } from "@/app/config";
import type { PuzzleMode, RoomVisibility } from "@/types/firestore";
import { computeGridLayout } from "@/features/puzzle/geometry";
import styles from "./CreatePuzzlePage.module.css";

type ImageSource =
  | { kind: "gallery"; imageId: string; width: number; height: number; label: string }
  | { kind: "upload"; imageId: string; width: number; height: number; previewUrl: string };

const RECOMMENDED_TAB = "Tavsiya etilgan";

interface PuzzleGridOverlayProps {
  cols: number;
  rows: number;
}

function PuzzleGridOverlay({ cols, rows }: PuzzleGridOverlayProps): JSX.Element {
  const safeCols = Math.max(1, cols);
  const safeRows = Math.max(1, rows);

  const vLines: number[] = [];
  for (let c = 1; c < safeCols; c++) {
    vLines.push((c / safeCols) * 100);
  }

  const hLines: number[] = [];
  for (let r = 1; r < safeRows; r++) {
    hLines.push((r / safeRows) * 100);
  }

  const total = safeCols * safeRows;
  const strokeWidth = total > 220 ? 0.25 : total > 90 ? 0.35 : 0.5;

  return (
    <svg className={styles.previewGridOverlay} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {/* Dark shadow lines so grid is clearly visible on light photos */}
      {vLines.map((pos, idx) => (
        <line
          key={`shadow-v${idx}`}
          x1={pos}
          y1="0"
          x2={pos}
          y2="100"
          stroke="rgba(0, 0, 0, 0.45)"
          strokeWidth={strokeWidth * 2}
        />
      ))}
      {hLines.map((pos, idx) => (
        <line
          key={`shadow-h${idx}`}
          x1="0"
          y1={pos}
          x2="100"
          y2={pos}
          stroke="rgba(0, 0, 0, 0.45)"
          strokeWidth={strokeWidth * 2}
        />
      ))}

      {/* Crisp white lines representing individual puzzle piece cuts */}
      {vLines.map((pos, idx) => (
        <line
          key={`v${idx}`}
          x1={pos}
          y1="0"
          x2={pos}
          y2="100"
          stroke="rgba(255, 255, 255, 0.65)"
          strokeWidth={strokeWidth}
        />
      ))}
      {hLines.map((pos, idx) => (
        <line
          key={`h${idx}`}
          x1="0"
          y1={pos}
          x2="100"
          y2={pos}
          stroke="rgba(255, 255, 255, 0.65)"
          strokeWidth={strokeWidth}
        />
      ))}
    </svg>
  );
}

export function CreatePuzzlePage(): JSX.Element {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<PuzzleMode>("classic");
  const [difficulty, setDifficulty] = useState<keyof typeof DIFFICULTY_PRESETS>("standard");
  const [pieceCount, setPieceCount] = useState(DIFFICULTY_PRESETS.standard.pieceCount);
  const [visibility, setVisibility] = useState<RoomVisibility>("unlisted");

  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState(RECOMMENDED_TAB);

  const [imageSource, setImageSource] = useState<ImageSource | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchGalleryImages()
      .then((images) => {
        if (!active) return;
        setGalleryImages(images);
        const first = images[0];
        if (first) {
          setImageSource((prev) =>
            prev ?? { kind: "gallery", imageId: first.imageId, width: first.width, height: first.height, label: first.label },
          );
        }
      })
      .catch(() => {
        if (active) setGalleryError("Tayyor rasmlar ro'yxatini yuklab bo'lmadi.");
      })
      .finally(() => {
        if (active) setGalleryLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [RECOMMENDED_TAB];
    for (const image of galleryImages) {
      if (!seen.has(image.category)) {
        seen.add(image.category);
        list.push(image.category);
      }
    }
    return list;
  }, [galleryImages]);

  const visibleImages =
    activeCategory === RECOMMENDED_TAB
      ? computeRecommendedImages(galleryImages)
      : galleryImages.filter((img) => img.category === activeCategory);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file || !user) return;
    setUploadError(null);
    setUploading(true);
    try {
      const validation = await validateImageFile(file);
      if (!validation.ok) {
        setUploadError(validation.error.message);
        return;
      }
      const imageId = await uploadPuzzleImage(user.uid, file, validation);
      setImageSource({
        kind: "upload",
        imageId,
        width: validation.width,
        height: validation.height,
        previewUrl: mediaUrl(`/media/${imageId}`),
      });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Yuklashda xatolik yuz berdi.");
    } finally {
      setUploading(false);
    }
  }

  function applyDifficulty(preset: keyof typeof DIFFICULTY_PRESETS): void {
    setDifficulty(preset);
    setPieceCount(DIFFICULTY_PRESETS[preset].pieceCount);
  }

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!user) return;
    setFormError(null);
    if (!imageSource) {
      setFormError("Avval rasm tanlang yoki yuklang.");
      return;
    }
    try {
      validatePieceCount(pieceCount);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Bo'laklar soni noto'g'ri.");
      return;
    }

    setSubmitting(true);
    try {
      const preset = DIFFICULTY_PRESETS[difficulty];
      const { roomId } = await createRoom({
        ownerUid: user.uid,
        ownerDisplayName: user.displayName ?? "O'yinchi",
        mode,
        imageId: imageSource.imageId,
        imageWidthPx: imageSource.width,
        imageHeightPx: imageSource.height,
        pieceCount,
        visibility,
        snapEnabled: true,
        rotationEnabled: preset.rotationEnabled,
        snapToleranceRatio: preset.snapToleranceRatio,
      });
      navigate(`/room/${roomId}`);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Xona yaratib bo'lmadi.");
    } finally {
      setSubmitting(false);
    }
  }

  const previewUrl =
    imageSource?.kind === "gallery"
      ? mediaUrl(`/gallery/${imageSource.imageId.slice("gallery:".length)}`)
      : (imageSource?.previewUrl ?? null);
  const previewLabel = imageSource?.kind === "gallery" ? imageSource.label : imageSource?.kind === "upload" ? "O'z rasmingiz" : "—";
  const difficultyLabel = DIFFICULTY_PRESETS[difficulty].label;

  const gridLayout = useMemo(() => {
    const aspect =
      imageSource && imageSource.width > 0 && imageSource.height > 0
        ? imageSource.width / imageSource.height
        : 4 / 3;
    return computeGridLayout(pieceCount, aspect);
  }, [imageSource, pieceCount]);

  const actualPieceCount = gridLayout.cols * gridLayout.rows;

  return (
    <form className={styles.page} onSubmit={handleSubmit}>
      <div className={styles.header}>
        <div className={styles.headerIcon} aria-hidden="true">🧩</div>
        <div>
          <h1 className={styles.headerTitle}>Yangi pazl yaratish</h1>
          <p className={styles.headerSubtitle}>O&apos;zingizga yoqqan rasm bilan yangi hamkorlik pazlini yarating.</p>
        </div>
      </div>

      <div className={styles.layout}>
        <div className={styles.mainColumn}>
          {/* 1. Mode */}
          <fieldset className={styles.card}>
            <legend className={styles.cardTitle}>1. Pazl rejimini tanlang</legend>
            <p className={styles.cardSubtitle}>O&apos;yin qoidasi va tajribani tanlang</p>
            <div className={styles.modeGrid}>
              <label className={`${styles.modeCard} ${mode === "classic" ? styles.modeCardActive : ""}`}>
                <input type="radio" name="mode" checked={mode === "classic"} onChange={() => setMode("classic")} className={styles.visuallyHiddenInput} />
                <span className={styles.modeIcon} aria-hidden="true">🧩</span>
                <span className={styles.modeTexts}>
                  <strong>Klassik rejim</strong>
                  <span>Asl tasvirni tiklang. Bo&apos;laklar o&apos;z joyiga mos ravishda joylashadi.</span>
                </span>
              </label>
              <label className={`${styles.modeCard} ${mode === "free" ? styles.modeCardActive : ""}`}>
                <input type="radio" name="mode" checked={mode === "free"} onChange={() => setMode("free")} className={styles.visuallyHiddenInput} />
                <span className={styles.modeIcon} aria-hidden="true">✦</span>
                <span className={styles.modeTexts}>
                  <strong>Erkin rejim</strong>
                  <span>Bo&apos;laklarni istalgancha joylashtiring. Cheksiz ijodiy erkinlik.</span>
                </span>
              </label>
            </div>
          </fieldset>

          {/* 2. Image source */}
          <fieldset className={styles.card}>
            <legend className={styles.cardTitle}>2. Rasm manbaini tanlang</legend>
            <p className={styles.cardSubtitle}>Kolleksiyadagi rasmlar yoki o&apos;zingizning rasmingiz</p>

            <div className={styles.categoryTabs} role="tablist">
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  role="tab"
                  aria-selected={activeCategory === category}
                  className={`${styles.categoryTab} ${activeCategory === category ? styles.categoryTabActive : ""}`}
                  onClick={() => setActiveCategory(category)}
                >
                  {category}
                </button>
              ))}
            </div>

            {galleryLoading && <p role="status" className={styles.mutedNote}>Tayyor rasmlar yuklanmoqda…</p>}
            {galleryError && <p role="alert" className={styles.error}>{galleryError}</p>}
            {!galleryLoading && !galleryError && galleryImages.length === 0 && (
              <p className={styles.mutedNote}>Hozircha tayyor rasmlar yo&apos;q — o&apos;z rasmingizni yuklang.</p>
            )}

            <div className={styles.gallery}>
              {visibleImages.map((image) => (
                <label key={image.imageId} className={styles.galleryOption}>
                  <input
                    type="radio"
                    name="image"
                    checked={imageSource?.kind === "gallery" && imageSource.imageId === image.imageId}
                    onChange={() =>
                      setImageSource({ kind: "gallery", imageId: image.imageId, width: image.width, height: image.height, label: image.label })
                    }
                    className={styles.visuallyHiddenInput}
                  />
                  <img src={mediaUrl(`/gallery/${image.imageId.slice("gallery:".length)}`)} alt={image.label} className={styles.galleryThumb} />
                  <span className={styles.galleryLabel}>{image.label}</span>
                </label>
              ))}
              <label className={styles.uploadTile}>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} disabled={uploading} className={styles.visuallyHiddenInput} />
                <span className={styles.uploadIcon} aria-hidden="true">⬆</span>
                <span>O&apos;z rasmigizni yuklash</span>
              </label>
            </div>
            {uploading && <p role="status" className={styles.mutedNote}>Yuklanmoqda…</p>}
            {uploadError && <p role="alert" className={styles.error}>{uploadError}</p>}
            {imageSource?.kind === "upload" && <p className={styles.uploadedNote}>Rasm yuklandi ✓</p>}
          </fieldset>

          {/* 3. Difficulty */}
          <fieldset className={styles.card}>
            <legend className={styles.cardTitle}>3. Qiyinchilik darajasi va bo&apos;laklar soni</legend>
            <p className={styles.cardSubtitle}>Pazl hajmi va murakkablik darajasini tanlang</p>
            <div className={styles.difficultyGrid}>
              {(Object.keys(DIFFICULTY_PRESETS) as Array<keyof typeof DIFFICULTY_PRESETS>).map((key) => (
                <label key={key} className={`${styles.difficultyCard} ${difficulty === key ? styles.difficultyCardActive : ""}`}>
                  <input type="radio" name="difficulty" checked={difficulty === key} onChange={() => applyDifficulty(key)} className={styles.visuallyHiddenInput} />
                  <strong>{DIFFICULTY_PRESETS[key].label}</strong>
                  <span>{DIFFICULTY_PRESETS[key].pieceCount} bo&apos;lak</span>
                </label>
              ))}
            </div>
            <div className={styles.sliderRow}>
              <span className={styles.sliderLabel}>Bo&apos;laklar soni</span>
              <span className={styles.sliderValue}>{pieceCount}</span>
            </div>
            <input
              type="range"
              min={PUZZLE_PIECE_COUNT_MIN}
              max={PUZZLE_PIECE_COUNT_MAX}
              step={5}
              value={pieceCount}
              onChange={(e) => {
                const val = Number(e.target.value);
                setPieceCount(val);
                const matched = (Object.keys(DIFFICULTY_PRESETS) as Array<keyof typeof DIFFICULTY_PRESETS>).find(
                  (k) => DIFFICULTY_PRESETS[k].pieceCount === val,
                );
                if (matched) setDifficulty(matched);
              }}
              className={styles.slider}
            />
            <div className={styles.sliderBounds}>
              <span>{PUZZLE_PIECE_COUNT_MIN} bo&apos;lak</span>
              <span>Maksimal: {PUZZLE_PIECE_COUNT_MAX}</span>
            </div>
          </fieldset>

          {/* 4. Visibility */}
          <fieldset className={styles.card}>
            <legend className={styles.cardTitle}>4. Xona ko&apos;rinishi</legend>
            <p className={styles.cardSubtitle}>Xona qanday ishtirokchilar uchun ochiq bo&apos;lishini tanlang</p>
            <div className={styles.visibilityGrid}>
              <label className={`${styles.visibilityCard} ${visibility === "unlisted" ? styles.visibilityCardActive : ""}`}>
                <input type="radio" name="visibility" checked={visibility === "unlisted"} onChange={() => setVisibility("unlisted")} className={styles.visuallyHiddenInput} />
                <strong>🔗 Havola bilan</strong>
                <span>Havolaga ega har kim qo&apos;shilishi mumkin</span>
              </label>
              <label className={`${styles.visibilityCard} ${visibility === "private" ? styles.visibilityCardActive : ""}`}>
                <input type="radio" name="visibility" checked={visibility === "private"} onChange={() => setVisibility("private")} className={styles.visuallyHiddenInput} />
                <strong>🔒 Xususiy</strong>
                <span>Faqat taklif qilingan ishtirokchilar</span>
              </label>
            </div>
          </fieldset>
        </div>

        {/* RIGHT: live preview */}
        <aside className={styles.previewColumn}>
          <div className={styles.previewCard}>
            <h2 className={styles.previewTitle}>Pazl ko&apos;rinishi</h2>
            <p className={styles.cardSubtitle}>Tanlangan rasm va sozlamalar asosida taxminiy ko&apos;rinish</p>
            <div
              className={styles.previewImageBox}
              style={{ aspectRatio: `${imageSource?.width ?? 4} / ${imageSource?.height ?? 3}` }}
            >
              {previewUrl ? (
                <>
                  <img src={previewUrl} alt={previewLabel} className={styles.previewImage} />
                  <PuzzleGridOverlay cols={gridLayout.cols} rows={gridLayout.rows} />
                  <div className={styles.gridBadge}>
                    {actualPieceCount} bo&apos;lak ({gridLayout.cols} × {gridLayout.rows})
                  </div>
                </>
              ) : (
                <div className={styles.previewPlaceholder}>Rasm tanlanmagan</div>
              )}
            </div>
          </div>

          <div className={styles.summaryCard}>
            <h3 className={styles.summaryTitle}>🧩 Pazl ma&apos;lumotlari</h3>
            <dl className={styles.summaryList}>
              <div className={styles.summaryRow}>
                <dt>Rejim</dt>
                <dd>{mode === "classic" ? "Klassik rejim" : "Erkin rejim"}</dd>
              </div>
              <div className={styles.summaryRow}>
                <dt>Bo&apos;laklar soni</dt>
                <dd>{actualPieceCount} ({gridLayout.cols} × {gridLayout.rows})</dd>
              </div>
              <div className={styles.summaryRow}>
                <dt>Qiyinchilik</dt>
                <dd>{difficultyLabel}</dd>
              </div>
              <div className={styles.summaryRow}>
                <dt>Xona ko&apos;rinishi</dt>
                <dd>{visibility === "unlisted" ? "Havola bilan" : "Xususiy"}</dd>
              </div>
              <div className={styles.summaryRow}>
                <dt>Rasm manbai</dt>
                <dd>{previewLabel}</dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>

      {formError && <p role="alert" className={styles.error}>{formError}</p>}

      <div className={styles.footerActions}>
        <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>
          Bekor qilish
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting || uploading || !imageSource}>
          {submitting ? "Yaratilmoqda…" : "+ Xonani yaratish"}
        </button>
      </div>
    </form>
  );
}
