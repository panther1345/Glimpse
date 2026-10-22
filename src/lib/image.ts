/** Downscale + JPEG-compress a data URL so every provider accepts it (Groq: 4MB base64, 33MP; OpenAI/Gemini: ~20MB). */
export async function shrinkImage(dataUrl: string, maxSide = 2000, maxB64 = 3_500_000): Promise<string> {
  if (!dataUrl.startsWith('data:image/')) return dataUrl;
  try {
    const bmp = await createImageBitmap(await (await fetch(dataUrl)).blob());
    let scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    if (scale === 1 && dataUrl.length < 1_000_000) return dataUrl;
    for (let q = 0.85; ; q -= 0.15, scale *= 0.8) {
      const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
      const c = new OffscreenCanvas(w, h); const g = c.getContext('2d')!;
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(bmp, 0, 0, w, h);
      const out = await blobToDataUrl(await c.convertToBlob({ type: 'image/jpeg', quality: Math.max(0.5, q) }));
      if (out.length <= maxB64 || q < 0.3) return out;
    }
  } catch { return dataUrl; }
}
export async function blobToDataUrl(blob: Blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `data:${blob.type};base64,${btoa(s)}`;
}
