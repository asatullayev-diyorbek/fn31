import { mediaUrl } from "@/lib/api";
import { galleryImagePath, isGalleryImageId } from "./gallery";

export async function loadPuzzleImage(imageId: string): Promise<HTMLImageElement> {
  const url = isGalleryImageId(imageId)
    ? mediaUrl(`/gallery/${galleryImagePath(imageId)}`)
    : mediaUrl(`/media/${imageId}`);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Rasmni yuklab bo'lmadi."));
    image.src = url;
  });
}
