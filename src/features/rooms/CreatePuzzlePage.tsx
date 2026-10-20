import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthProvider";
import { GALLERY_IMAGES } from "@/features/images/gallery";
import { uploadPuzzleImage, validateImageFile } from "@/features/images/uploadImage";
import { DIFFICULTY_PRESETS, createRoom, validatePieceCount } from "@/features/rooms/roomsApi";
import { PUZZLE_PIECE_COUNT_MAX, PUZZLE_PIECE_COUNT_MIN } from "@/app/config";
import type { PuzzleMode, RoomVisibility } from "@/types/firestore";
import styles from "./CreatePuzzlePage.module.css";

type ImageSource = { kind: "gallery"; imageId: string } | { kind: "upload"; imageId: string };

export function CreatePuzzlePage(): JSX.Element {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<PuzzleMode>("classic");
  const [difficulty, setDifficulty] = useState<keyof typeof DIFFICULTY_PRESETS>("standard");
  const [pieceCount, setPieceCount] = useState(DIFFICULTY_PRESETS.standard.pieceCount);
  const [visibility, setVisibility] = useState<RoomVisibility>("unlisted");
  const [imageSource, setImageSource] = useState<ImageSource>({
    kind: "gallery",
    imageId: GALLERY_IMAGES[0]?.imageId ?? "",
  });
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function applyDifficulty(preset: keyof typeof DIFFICULTY_PRESETS): void {
    setDifficulty(preset);
    setPieceCount(DIFFICULTY_PRESETS[preset].pieceCount);
  }

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
      setImageSource({ kind: "upload", imageId });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Yuklashda xatolik yuz berdi.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!user) return;
    setFormError(null);
    try {
      validatePieceCount(pieceCount);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Bo'laklar soni noto'g'ri.");
      return;
    }

    setSubmitting(true);
    try {
      const preset = DIFFICULTY_PRESETS[difficulty];
      const dimensions =
        imageSource.kind === "gallery"
          ? (GALLERY_IMAGES.find((g) => g.imageId === imageSource.imageId) ?? GALLERY_IMAGES[0])
          : undefined;

      const { roomId } = await createRoom({
        ownerUid: user.uid,
        ownerDisplayName: user.displayName ?? "O'yinchi",
        mode,
        imageId: imageSource.imageId,
        imageWidthPx: dimensions?.width ?? 1200,
        imageHeightPx: dimensions?.height ?? 800,
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

  return (
    <form className={styles.page} onSubmit={handleSubmit}>
      <h1>Yangi pazl yaratish</h1>

      <fieldset className={styles.field}>
        <legend>Rejim</legend>
        <label>
          <input type="radio" name="mode" checked={mode === "classic"} onChange={() => setMode("classic")} />
          Klassik — asl tasvirni tiklang
        </label>
        <label>
          <input type="radio" name="mode" checked={mode === "free"} onChange={() => setMode("free")} />
          Erkin — bo&apos;laklarni istalgancha joylashtiring
        </label>
      </fieldset>

      <fieldset className={styles.field}>
        <legend>Rasm manbai</legend>
        <div className={styles.gallery}>
          {GALLERY_IMAGES.map((image) => (
            <label key={image.imageId} className={styles.galleryOption}>
              <input
                type="radio"
                name="image"
                checked={imageSource.kind === "gallery" && imageSource.imageId === image.imageId}
                onChange={() => setImageSource({ kind: "gallery", imageId: image.imageId })}
              />
              {image.label}
            </label>
          ))}
        </div>
        <label className={styles.uploadLabel}>
          Yoki o&apos;z rasmingizni yuklang (JPEG/PNG/WebP, 15 MB gacha)
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} disabled={uploading} />
        </label>
        {uploading && <p role="status">Yuklanmoqda…</p>}
        {uploadError && <p role="alert" className={styles.error}>{uploadError}</p>}
        {imageSource.kind === "upload" && <p className={styles.uploadedNote}>Rasm yuklandi ✓</p>}
      </fieldset>

      <fieldset className={styles.field}>
        <legend>Qiyinlik darajasi</legend>
        {(Object.keys(DIFFICULTY_PRESETS) as Array<keyof typeof DIFFICULTY_PRESETS>).map((key) => (
          <label key={key}>
            <input
              type="radio"
              name="difficulty"
              checked={difficulty === key}
              onChange={() => applyDifficulty(key)}
            />
            {DIFFICULTY_PRESETS[key].label} ({DIFFICULTY_PRESETS[key].pieceCount} bo&apos;lak)
          </label>
        ))}
        <label className={styles.customPieceCount}>
          Bo&apos;laklar soni ({PUZZLE_PIECE_COUNT_MIN}–{PUZZLE_PIECE_COUNT_MAX})
          <input
            type="number"
            min={PUZZLE_PIECE_COUNT_MIN}
            max={PUZZLE_PIECE_COUNT_MAX}
            value={pieceCount}
            onChange={(e) => setPieceCount(Number(e.target.value))}
          />
        </label>
      </fieldset>

      <fieldset className={styles.field}>
        <legend>Xona ko&apos;rinishi</legend>
        <label>
          <input
            type="radio"
            name="visibility"
            checked={visibility === "unlisted"}
            onChange={() => setVisibility("unlisted")}
          />
          Havola bilan — havolaga ega har kim qo&apos;shilishi mumkin
        </label>
        <label>
          <input
            type="radio"
            name="visibility"
            checked={visibility === "private"}
            onChange={() => setVisibility("private")}
          />
          Xususiy — faqat taklif qilingan ishtirokchilar
        </label>
      </fieldset>

      {formError && <p role="alert" className={styles.error}>{formError}</p>}

      <button type="submit" className="btn btn-primary" disabled={submitting || uploading}>
        {submitting ? "Yaratilmoqda…" : "Xonani yaratish"}
      </button>
    </form>
  );
}
