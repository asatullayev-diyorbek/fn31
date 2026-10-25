import { api } from "@/lib/api";

/** A real image served by the backend from `backend/gallery/<categorySlug>/<file>` — see backend/README.md for how to add more. */
export interface GalleryImage {
  /** `gallery:<categorySlug>/<file>` — self-describing: callers build the static URL
   * (`/gallery/<categorySlug>/<file>`) directly from this id, the same way an
   * uploaded image's id maps to `/media/<id>`. No lookup/fetch required. */
  imageId: string;
  label: string;
  category: string;
  categorySlug: string;
  width: number;
  height: number;
  /** File mtime, ISO string — when it was added to the gallery. */
  createdAt: string;
  /** How many rooms have ever been created with this image, server-computed. */
  usageCount: number;
}

export function isGalleryImageId(imageId: string): boolean {
  return imageId.startsWith("gallery:");
}

/** The `<categorySlug>/<file>` part of a gallery id — the path under `/gallery/`. */
export function galleryImagePath(imageId: string): string {
  return imageId.slice("gallery:".length);
}

/** A human label derived straight from a gallery id's filename, with no network round trip — used where only the id is on hand (e.g. the puzzle room's title). */
export function galleryLabelFromId(imageId: string): string {
  const fileName = galleryImagePath(imageId).split("/").pop() ?? "";
  const base = fileName.replace(/\.[^.]+$/, "");
  return base
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export async function fetchGalleryImages(): Promise<GalleryImage[]> {
  return (await api<{ images: GalleryImage[] }>("/api/gallery")).images;
}

/**
 * The "Tavsiya etilgan" (Recommended) tab: the 5 most-used images (by how
 * many rooms have ever been created with them) plus the 3 most recently
 * added, deduplicated — a newest image that's already popular enough to be
 * in the top 5 doesn't take a second slot. Ties in usage count fall back to
 * recency so a freshly added, not-yet-used image doesn't clump at the
 * bottom of a block of untouched images sorted arbitrarily.
 */
export function computeRecommendedImages(images: readonly GalleryImage[]): GalleryImage[] {
  const byUsage = [...images].sort((a, b) => b.usageCount - a.usageCount || b.createdAt.localeCompare(a.createdAt));
  const topUsed = byUsage.slice(0, 5);

  const byRecency = [...images].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const seen = new Set(topUsed.map((img) => img.imageId));
  const newest: GalleryImage[] = [];
  for (const image of byRecency) {
    if (newest.length >= 3) break;
    if (seen.has(image.imageId)) continue;
    seen.add(image.imageId);
    newest.push(image);
  }

  return [...topUsed, ...newest];
}
