"use client";

/**
 * Downscale a camera photo to at most `maxSide` px and re-encode as JPEG,
 * so uploads stay small (phone photos are often 4–8 MB).
 */
export async function resizeImage(
  file: File,
  maxSide = 1280,
  quality = 0.85,
): Promise<{ data: string; mediaType: "image/jpeg"; previewUrl: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const previewUrl = canvas.toDataURL("image/jpeg", quality);
  return { data: previewUrl.split(",")[1], mediaType: "image/jpeg", previewUrl };
}
