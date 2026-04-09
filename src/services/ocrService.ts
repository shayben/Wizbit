/**
 * Azure Computer Vision OCR service.
 * Sends an image (base64 data URL or Blob) to the Azure Read API and
 * returns the recognised text as a single string.
 *
 * An optional LLM postprocessing pass (GPT-4o-mini) cleans OCR noise
 * and restructures the output for easier reading.
 */

const VISION_ENDPOINT = import.meta.env.VITE_AZURE_VISION_ENDPOINT as string;
const VISION_KEY = import.meta.env.VITE_AZURE_VISION_KEY as string;

const OPENAI_ENDPOINT = import.meta.env.VITE_AZURE_OPENAI_ENDPOINT as string;
const OPENAI_KEY = import.meta.env.VITE_AZURE_OPENAI_KEY as string;
const OPENAI_DEPLOYMENT = import.meta.env.VITE_AZURE_OPENAI_DEPLOYMENT as string;

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

const CLEAN_PROMPT = `You are an OCR postprocessor for a children's reading app.
Given raw OCR lines from a scanned page, return ONLY the main readable text.

Rules:
- Remove page numbers, headers, footers, watermarks, URLs, copyright notices
- Remove stray symbols, OCR artifacts, and partial/garbled words
- If there is a title or heading, put it on its own line followed by a blank line
- Separate paragraphs with a blank line
- Fix obvious OCR errors (e.g. "rn" → "m", "l" → "I" in context)
- Do NOT add, rephrase, or summarise — keep the original wording
- Return the cleaned text only, no commentary`;

const MAX_RETRIES = 3;

async function fetchWithRetry(url: string, init: RequestInit, retries = MAX_RETRIES): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, init);
    if (res.status !== 429 || attempt === retries) return res;
    const retryAfter = Number(res.headers.get('Retry-After') || 0);
    const delay = Math.max(retryAfter * 1000, 2000 * 2 ** attempt);
    await new Promise((r) => setTimeout(r, delay));
  }
  return fetch(url, init);
}

/**
 * Use GPT-4o-mini to clean raw OCR lines: remove noise, fix layout.
 * Returns the original text unchanged if the LLM is unavailable.
 */
async function postprocessOcr(lines: string[]): Promise<string> {
  if (!OPENAI_ENDPOINT || !OPENAI_KEY || !OPENAI_DEPLOYMENT || lines.length === 0) {
    return lines.join(' ');
  }

  const url = `${OPENAI_ENDPOINT}/openai/deployments/${OPENAI_DEPLOYMENT}/chat/completions?api-version=2024-02-01`;

  try {
    const res = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'api-key': OPENAI_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: CLEAN_PROMPT },
          { role: 'user', content: lines.join('\n') },
        ],
        temperature: 0.1,
        max_tokens: 1000,
      }),
    });

    if (!res.ok) return lines.join(' ');

    const data = await res.json();
    const cleaned: string = data?.choices?.[0]?.message?.content ?? '';
    return cleaned.trim() || lines.join(' ');
  } catch {
    return lines.join(' ');
  }
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

  const text = await postprocessOcr(lines);
  return { text, lines };
}
