import { mediaUrl } from "@/lib/api";
import { findGalleryImage, isGalleryImageId } from "./gallery";
import { createPlaceholderImage } from "./placeholderImage";
export async function loadPuzzleImage(imageId: string): Promise<HTMLImageElement> { if (isGalleryImageId(imageId)) { const image = findGalleryImage(imageId); return createPlaceholderImage(image?.width ?? 1200, image?.height ?? 800, image?.label ?? "PuzzleTogether"); } return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error("Rasmni yuklab bo'lmadi.")); image.src = mediaUrl(`/media/${imageId}`); }); }
