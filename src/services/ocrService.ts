/**
 * Azure Computer Vision OCR service.
 * Sends an image (base64 data URL or Blob) to the Azure Read API and
 * returns the recognised text as a single string.
 */

const VISION_ENDPOINT = import.meta.env.VITE_AZURE_VISION_ENDPOINT as string;
const VISION_KEY = import.meta.env.VITE_AZURE_VISION_KEY as string;

export interface OcrResult {
  text: string;
  lines: string[];
}

/**
 * Convert a base64 data-URL to a Blob so it can be POSTed as binary.
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mimeType = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
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

  const blob = dataUrlToBlob(imageDataUrl);

  // Step 1 – submit image to the Read API
  const submitUrl = `${VISION_ENDPOINT.replace(/\/$/, '')}/computervision/imageanalysis:analyze?api-version=2024-02-01&features=read`;
  const submitRes = await fetch(submitUrl, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': VISION_KEY,
      'Content-Type': blob.type,
    },
    body: blob,
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text();
    throw new Error(`Azure Vision API error ${submitRes.status}: ${errText}`);
  }

  const data = await submitRes.json();

  // Extract text lines from the response.
  // The Image Analysis 4.0 API nests lines under readResult.blocks (not pages)
  // and uses "text" (not "content") for the line string.
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
