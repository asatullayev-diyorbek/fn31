/**
 * Built-in gallery images, for development and as a network-independent
 * fallback: deterministic, locally generated so no external fetch is
 * required. Real custom uploads go through `features/images` Storage
 * integration instead (see docs/architecture.md §Images).
 */
export function createPlaceholderImage(
  width: number,
  height: number,
  label: string,
): Promise<HTMLImageElement> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#2563eb");
  gradient.addColorStop(1, "#7c3aed");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  const spacing = Math.max(40, Math.round(Math.min(width, height) / 10));
  for (let x = spacing; x < width; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = spacing; y < height; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = `bold ${Math.round(Math.min(width, height) / 8)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, width / 2, height / 2);

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("placeholder image failed to decode"));
    image.src = canvas.toDataURL("image/png");
  });
}
