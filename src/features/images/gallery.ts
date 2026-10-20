export interface GalleryImage {
  /** Prefixed with "gallery:" so the puzzle-loading code can tell a
   * built-in image (generated client-side, see placeholderImage.ts) apart
   * from a real `images/{imageId}` Storage-backed upload without an extra
   * Firestore read. */
  imageId: string;
  label: string;
  width: number;
  height: number;
}

/**
 * Built-in gallery. In this environment there is no deployed Storage
 * bucket to seed with real photography (see docs/deployment.md), so
 * gallery images are generated on the client from a label + color, the
 * same way the Phase 3 demo's placeholder image works — a real
 * deployment would instead seed `images/{imageId}` docs with
 * `ownerUid: null` and real Storage objects (see firestore.rules'
 * comment on why clients can never create those themselves).
 */
export const GALLERY_IMAGES: GalleryImage[] = [
  { imageId: "gallery:tog-manzarasi", label: "Tog' manzarasi", width: 1200, height: 800 },
  { imageId: "gallery:dengiz", label: "Dengiz sohili", width: 1200, height: 800 },
  { imageId: "gallery:shahar", label: "Shahar ko'chasi", width: 1200, height: 900 },
  { imageId: "gallery:gullar", label: "Rang-barang gullar", width: 1000, height: 1000 },
];

export function isGalleryImageId(imageId: string): boolean {
  return imageId.startsWith("gallery:");
}

export function findGalleryImage(imageId: string): GalleryImage | undefined {
  return GALLERY_IMAGES.find((image) => image.imageId === imageId);
}
