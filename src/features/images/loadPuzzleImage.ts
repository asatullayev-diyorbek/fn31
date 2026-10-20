import { doc, getDoc } from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import { getFirebaseFirestore, getFirebaseStorage } from "@/lib/firebase/client";
import { findGalleryImage, isGalleryImageId } from "./gallery";
import { createPlaceholderImage } from "./placeholderImage";
import type { ImageRecord } from "@/types/firestore";

/** Resolves an `imageId` (gallery or uploaded) to a decoded, drawable image — the single place the puzzle engine's image source comes from. */
export async function loadPuzzleImage(imageId: string): Promise<HTMLImageElement> {
  if (isGalleryImageId(imageId)) {
    const gallery = findGalleryImage(imageId);
    if (!gallery) throw new Error(`Unknown gallery image: ${imageId}`);
    return createPlaceholderImage(gallery.width, gallery.height, gallery.label);
  }

  const snapshot = await getDoc(doc(getFirebaseFirestore(), "images", imageId));
  if (!snapshot.exists()) throw new Error("Rasm topilmadi.");
  const record = snapshot.data() as ImageRecord;
  const downloadUrl = await getDownloadURL(ref(getFirebaseStorage(), record.storagePath));

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Rasmni yuklab bo'lmadi."));
    image.src = downloadUrl;
  });
}
