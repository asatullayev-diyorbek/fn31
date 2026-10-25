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
