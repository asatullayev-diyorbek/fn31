import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { getFirebaseFirestore, getFirebaseStorage } from "@/lib/firebase/client";
import { randomBytes } from "@/lib/validation/randomId";

const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export interface ImageValidationError {
  code: "unsupported-type" | "too-large" | "undecodable";
  message: string;
}

/**
 * Validates by actually decoding the file (`createImageBitmap`), not by
 * trusting its name or declared MIME type — a renamed non-image file (or
 * a corrupted one) fails to decode and is rejected here, before anything
 * is uploaded. Storage rules independently re-check size/content-type
 * server-side (see storage.rules) since client-side checks are only a
 * UX nicety, never the real boundary.
 */
export async function validateImageFile(
  file: File,
): Promise<{ ok: true; width: number; height: number } | { ok: false; error: ImageValidationError }> {
  if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
    return {
      ok: false,
      error: { code: "unsupported-type", message: "Faqat JPEG, PNG yoki WebP formatlari qo'llab-quvvatlanadi." },
    };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: { code: "too-large", message: "Fayl hajmi 15 MB dan oshmasligi kerak." } };
  }
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    bitmap.close();
    return { ok: true, width, height };
  } catch {
    return {
      ok: false,
      error: { code: "undecodable", message: "Fayl rasm sifatida ochilmadi — u buzilgan bo'lishi mumkin." },
    };
  }
}

export interface UploadProgress {
  bytesTransferred: number;
  totalBytes: number;
}

export async function uploadPuzzleImage(
  uid: string,
  file: File,
  dimensions: { width: number; height: number },
  onProgress?: (progress: UploadProgress) => void,
): Promise<string> {
  const imageId = randomBytes(12);
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const storagePath = `images/${uid}/${imageId}.${extension}`;
  const storageRef = ref(getFirebaseStorage(), storagePath);

  await new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, { contentType: file.type });
    task.on(
      "state_changed",
      (snapshot) => onProgress?.({ bytesTransferred: snapshot.bytesTransferred, totalBytes: snapshot.totalBytes }),
      reject,
      () => resolve(),
    );
  });

  await getDownloadURL(storageRef); // confirms the object is actually readable before we record it

  await setDoc(doc(getFirebaseFirestore(), "images", imageId), {
    imageId,
    ownerUid: uid,
    storagePath,
    width: dimensions.width,
    height: dimensions.height,
    contentType: file.type,
    sizeBytes: file.size,
    source: "upload",
    createdAt: serverTimestamp(),
  });

  return imageId;
}
