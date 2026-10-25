import { mediaUrl } from "@/lib/api";
import { galleryImagePath, isGalleryImageId } from "./gallery";

const CATEGORY_LABELS: Record<string, string> = {
  tabiat: "Tabiat",
  shahar: "Shahar",
  hayvonlar: "Hayvonlar",
  sanat: "San'at",
  minimal: "Minimal",
};

/** The puzzle's own source image — a real upload's URL, or a built-in gallery image's real file. Never a stand-in from an unrelated pool. */
export function resolveRoomThumbnailUrl(imageId: string | undefined): string {
  if (!imageId) return "";
  if (isGalleryImageId(imageId)) return mediaUrl(`/gallery/${galleryImagePath(imageId)}`);
  return mediaUrl(`/media/${imageId}`);
}

/** A short category label derived from the image id (gallery ids encode their category as the first path segment) for display next to the thumbnail. */
export function resolveRoomCategory(imageId: string | undefined): string {
  if (!imageId) return "Pazl";
  if (isGalleryImageId(imageId)) {
    const categorySlug = galleryImagePath(imageId).split("/")[0] ?? "";
    return CATEGORY_LABELS[categorySlug] ?? "Pazl";
  }
  return "Yuklangan rasm";
}
