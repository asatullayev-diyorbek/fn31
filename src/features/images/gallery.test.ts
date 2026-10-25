import { describe, expect, it } from "vitest";
import { computeRecommendedImages, type GalleryImage } from "./gallery";

function image(overrides: Partial<GalleryImage> & { imageId: string }): GalleryImage {
  return {
    label: overrides.imageId,
    category: "Tabiat",
    categorySlug: "tabiat",
    width: 1600,
    height: 1200,
    createdAt: "2026-01-01T00:00:00.000Z",
    usageCount: 0,
    ...overrides,
  };
}

describe("computeRecommendedImages", () => {
  it("picks the 5 most-used images", () => {
    const images = Array.from({ length: 10 }, (_, i) =>
      image({ imageId: `img${i}`, usageCount: i, createdAt: "2026-01-01T00:00:00.000Z" }),
    );
    const recommended = computeRecommendedImages(images);
    const topUsed = recommended.slice(0, 5).map((img) => img.imageId);
    expect(topUsed).toEqual(["img9", "img8", "img7", "img6", "img5"]);
  });

  it("appends the 3 newest images after the top 5 used", () => {
    const used = Array.from({ length: 5 }, (_, i) => image({ imageId: `used${i}`, usageCount: 10 - i, createdAt: "2026-01-01T00:00:00.000Z" }));
    const unused = [
      image({ imageId: "new1", usageCount: 0, createdAt: "2026-03-01T00:00:00.000Z" }),
      image({ imageId: "new2", usageCount: 0, createdAt: "2026-02-01T00:00:00.000Z" }),
      image({ imageId: "new3", usageCount: 0, createdAt: "2026-01-15T00:00:00.000Z" }),
      image({ imageId: "old", usageCount: 0, createdAt: "2026-01-01T00:00:00.000Z" }),
    ];
    const recommended = computeRecommendedImages([...used, ...unused]);
    expect(recommended).toHaveLength(8);
    expect(recommended.slice(5).map((img) => img.imageId)).toEqual(["new1", "new2", "new3"]);
  });

  it("never lists the same image twice when a newest image is also top-used", () => {
    const images = [
      image({ imageId: "popular-and-new", usageCount: 100, createdAt: "2026-05-01T00:00:00.000Z" }),
      ...Array.from({ length: 6 }, (_, i) => image({ imageId: `filler${i}`, usageCount: 5 - i, createdAt: "2026-01-01T00:00:00.000Z" })),
    ];
    const recommended = computeRecommendedImages(images);
    const ids = recommended.map((img) => img.imageId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("popular-and-new");
  });

  it("returns fewer than 8 when there aren't enough distinct images", () => {
    const images = [image({ imageId: "only-one", usageCount: 5 })];
    expect(computeRecommendedImages(images)).toHaveLength(1);
  });
});
