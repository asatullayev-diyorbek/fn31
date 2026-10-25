import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export interface GalleryImage {
  /** `gallery:<category-dir>/<filename>` — self-describing: the puzzle code
   * builds the static URL (`/gallery/<category-dir>/<filename>`) straight
   * from this id, the same way an uploaded image's id maps to `/media/<id>`. */
  imageId: string;
  label: string;
  category: string;
  categorySlug: string;
  width: number;
  height: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  tabiat: "Tabiat",
  shahar: "Shahar",
  hayvonlar: "Hayvonlar",
  mushuklar: "Mushuklar",
  daryolar: "Daryolar",
  sanat: "San'at",
  minimal: "Minimal",
};

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

/** Reads just enough of a JPEG or PNG file to find its pixel dimensions, without a decoding dependency. Falls back to a safe default (keeps the gallery listing usable even for a format/file this can't parse) rather than failing the whole scan. */
async function readImageDimensions(filePath: string): Promise<{ width: number; height: number }> {
  const buffer = await readFile(filePath);
  if (buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47 /* \x89PNG */) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    // JPEG: walk markers until an SOFn (start-of-frame) segment, which holds height/width.
    let offset = 2;
    while (offset < buffer.length - 9) {
      if (buffer[offset] !== 0xff) { offset++; continue; }
      const marker = buffer[offset + 1] as number;
      const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSOF) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      const segmentLength = buffer.readUInt16BE(offset + 2);
      offset += 2 + segmentLength;
    }
  }
  return { width: 1600, height: 1200 };
}

function slugToLabel(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "");
  return base
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Scans `galleryDir/<category>/<file>` on every call — the gallery is a human dropping a handful of files in occasionally, not a hot path, so there's no need for a cache that could go stale. */
export async function scanGalleryImages(galleryDir: string): Promise<GalleryImage[]> {
  const images: GalleryImage[] = [];
  let categoryDirs: string[];
  try {
    categoryDirs = (await readdir(galleryDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return images;
  }

  for (const categorySlug of categoryDirs) {
    const categoryPath = path.join(galleryDir, categorySlug);
    let files: string[];
    try {
      files = (await readdir(categoryPath, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
        .map((entry) => entry.name);
    } catch {
      continue;
    }
    for (const fileName of files) {
      const { width, height } = await readImageDimensions(path.join(categoryPath, fileName));
      images.push({
        imageId: `gallery:${categorySlug}/${fileName}`,
        label: slugToLabel(fileName),
        category: CATEGORY_LABELS[categorySlug] ?? slugToLabel(categorySlug),
        categorySlug,
        width,
        height,
      });
    }
  }

  return images.sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label));
}
