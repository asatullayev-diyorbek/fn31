import { mediaUrl } from "@/lib/api";
import { findGalleryImage, isGalleryImageId } from "./gallery";

const GALLERY_CATEGORY: Record<string, string> = {
  "gallery:tog-manzarasi": "Tabiat",
  "gallery:dengiz": "Tabiat",
  "gallery:shahar": "Shahar",
  "gallery:gullar": "Tabiat",
};

/**
 * A gallery "image" has no real file (see gallery.ts) — it's a gradient
 * generated on the client at puzzle-render time. For a small dashboard
 * thumbnail we don't need the full canvas round trip `loadPuzzleImage`
 * does; an equivalent inline SVG (same colors, the image's own label) is
 * synchronous and works directly as an <img src>.
 */
function galleryThumbnailDataUrl(label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#2563eb" />
        <stop offset="1" stop-color="#7c3aed" />
      </linearGradient>
    </defs>
    <rect width="200" height="200" fill="url(#g)" />
    <text x="100" y="105" font-family="sans-serif" font-size="20" font-weight="bold" fill="rgba(255,255,255,0.9)" text-anchor="middle">${label}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** The puzzle's own source image — a real upload's URL, or a built-in gallery image's generated placeholder. Never a stand-in from an unrelated pool. */
export function resolveRoomThumbnailUrl(imageId: string | undefined): string {
  if (!imageId) return galleryThumbnailDataUrl("Pazl");
  if (isGalleryImageId(imageId)) {
    return galleryThumbnailDataUrl(findGalleryImage(imageId)?.label ?? "Pazl");
  }
  return mediaUrl(`/media/${imageId}`);
}

/** A short category label derived from the actual image, for display next to the thumbnail. */
export function resolveRoomCategory(imageId: string | undefined): string {
  if (!imageId) return "Pazl";
  if (isGalleryImageId(imageId)) return GALLERY_CATEGORY[imageId] ?? "Pazl";
  return "Yuklangan rasm";
}
