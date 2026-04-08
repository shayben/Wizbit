/**
 * Azure Computer Vision OCR service.
 * Sends an image (base64 data URL or Blob) to the Azure Read API and
 * returns the recognised text as a single string.
 */

const VISION_ENDPOINT = import.meta.env.VITE_AZURE_VISION_ENDPOINT as string;
const VISION_KEY = import.meta.env.VITE_AZURE_VISION_KEY as string;

/** Max dimension (px) for the longest side before sending to Azure. */
const MAX_IMAGE_DIMENSION = 2048;
/** Target JPEG quality for recompression. */
const JPEG_QUALITY = 0.85;

export interface OcrResult {
  text: string;
  lines: string[];
}

/**
 * Resize and re-encode an image data-URL so that:
 *  - The longest side is at most MAX_IMAGE_DIMENSION px.
 *  - The blob stays well under the Azure 4 MB limit.
 *  - EXIF orientation is baked in (browsers apply it when drawing to canvas).
 */
async function prepareImage(dataUrl: string): Promise<Blob> {
  const img = await createImageBitmap(await (await fetch(dataUrl)).blob());

  let { width, height } = img;
  const longest = Math.max(width, height);
  if (longest > MAX_IMAGE_DIMENSION) {
    const scale = MAX_IMAGE_DIMENSION / longest;
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, width, height);
  img.close();

  return canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
}

/**
 * Run Azure Computer Vision Read (OCR) on the supplied image.
 * @param imageDataUrl  A base64 data-URL produced by <canvas>.toDataURL() or similar.
 */
export async function recognizeText(imageDataUrl: string): Promise<OcrResult> {
  if (!VISION_ENDPOINT || !VISION_KEY) {
    throw new Error(
      'Azure Computer Vision credentials are not configured. ' +
      'Set VITE_AZURE_VISION_ENDPOINT and VITE_AZURE_VISION_KEY in your .env file.'
    );
  }

  const blob = await prepareImage(imageDataUrl);

  const submitUrl = `${VISION_ENDPOINT.replace(/\/$/, '')}/computervision/imageanalysis:analyze?api-version=2024-02-01&features=read`;
  const submitRes = await fetch(submitUrl, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': VISION_KEY,
      'Content-Type': 'image/jpeg',
    },
    body: blob,
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text();
    throw new Error(`Azure Vision API error ${submitRes.status}: ${errText}`);
  }

  const data = await submitRes.json();

  // The Image Analysis 4.0 API nests lines under readResult.blocks
  // and uses "text" for the line string.
  const lines: string[] = [];
  const readResult = data?.readResult;
  for (const block of readResult?.blocks ?? []) {
    for (const line of block.lines ?? []) {
      const lineText: string = line.text ?? line.content ?? '';
      if (lineText.trim()) lines.push(lineText.trim());
    }
  }

  const text = lines.join(' ');
  return { text, lines };
}
