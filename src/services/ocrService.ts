/**
 * Azure Computer Vision OCR via the Wizbit backend proxy.
 *
 * Public surface (`recognizeText`) is unchanged. Internally we now POST a
 * compressed image to `/api/ocr/recognize` instead of calling Azure directly.
 * The backend forwards to Vision Read API and applies per-user rate limits.
 *
 * OCR cleanup (LLM postprocessing) goes through `/api/openai/chat` with
 * purpose:'ocr-clean' (charged 0 — bundled with the OCR call).
 */

import { apiPost, blobToBase64 } from './apiClient';

export interface OcrResult {
  text: string;
  lines: string[];
}

const MAX_IMAGE_DIMENSION = 2048;
const JPEG_QUALITY = 0.85;

/* ------------------------------------------------------------------------ */
/*  Layout types — extracted from Azure Vision bounding polygons             */
/* ------------------------------------------------------------------------ */

interface LayoutLine {
  text: string;
  yPct: number;
  heightPct: number;
  xPct: number;
  widthPct: number;
  confidence: number;
}

/* ------------------------------------------------------------------------ */
/*  Image preparation                                                        */
/* ------------------------------------------------------------------------ */

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function prepareImage(dataUrl: string): Promise<Blob> {
  const sourceBlob = dataUrlToBlob(dataUrl);
  const img = await createImageBitmap(sourceBlob);

  let { width, height } = img;
  const longest = Math.max(width, height);
  if (longest > MAX_IMAGE_DIMENSION) {
    const scale = MAX_IMAGE_DIMENSION / longest;
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      const oc = new OffscreenCanvas(width, height);
      const ctx = oc.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      img.close();
      return await oc.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
    } catch {
      /* fall through */
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, width, height);
  img.close();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Failed to compress image'))),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

/* ------------------------------------------------------------------------ */
/*  Layout extraction                                                        */
/* ------------------------------------------------------------------------ */

/* eslint-disable @typescript-eslint/no-explicit-any */
function extractLayoutLines(readResult: any, imgWidth: number, imgHeight: number): LayoutLine[] {
  const lines: LayoutLine[] = [];
  for (const block of readResult?.blocks ?? []) {
    for (const line of block.lines ?? []) {
      const text: string = (line.text ?? line.content ?? '').trim();
      if (!text) continue;

      const poly: Array<{ x: number; y: number }> = line.boundingPolygon ?? [];

      if (poly.length >= 4 && imgWidth > 0 && imgHeight > 0) {
        const xs = poly.map((p) => p.x);
        const ys = poly.map((p) => p.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        const words: any[] = line.words ?? [];
        const confidence =
          words.length > 0
            ? words.reduce((sum: number, w: any) => sum + (w.confidence ?? 0.5), 0) / words.length
            : 0.5;

        lines.push({
          text,
          yPct: ((minY + maxY) / 2 / imgHeight) * 100,
          heightPct: ((maxY - minY) / imgHeight) * 100,
          xPct: (minX / imgWidth) * 100,
          widthPct: ((maxX - minX) / imgWidth) * 100,
          confidence,
        });
      } else {
        lines.push({ text, yPct: 50, heightPct: 2, xPct: 0, widthPct: 100, confidence: 0.5 });
      }
    }
  }
  return lines;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function formatLayoutForLLM(layoutLines: LayoutLine[]): string {
  if (layoutLines.length === 0) return '';
  const heights = layoutLines.map((l) => l.heightPct).sort((a, b) => a - b);
  const medianHeight = heights[Math.floor(heights.length / 2)];

  const gaps: number[] = [];
  for (let i = 1; i < layoutLines.length; i++) {
    gaps.push(layoutLines[i].yPct - layoutLines[i - 1].yPct);
  }
  const medianGap = gaps.length > 0
    ? [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]
    : 0;

  return layoutLines
    .map((line, i) => {
      const tags: string[] = [];
      if (line.yPct < 8) tags.push('TOP');
      if (line.yPct > 92) tags.push('BOTTOM');
      if (line.heightPct > medianHeight * 1.4) tags.push('LARGE');

      const midX = line.xPct + line.widthPct / 2;
      if (midX > 35 && midX < 65 && line.widthPct < 60) tags.push('CENTER');

      const leftEdges = layoutLines.map((l) => l.xPct);
      const typicalLeft = leftEdges.sort((a, b) => a - b)[Math.floor(leftEdges.length * 0.25)];
      if (line.xPct > typicalLeft + 4) tags.push('INDENT');

      if (line.confidence < 0.7) tags.push('LOW-CONF');

      if (i > 0 && medianGap > 0) {
        const gap = layoutLines[i].yPct - layoutLines[i - 1].yPct;
        if (gap > medianGap * 1.8) tags.push('GAP');
      }

      const tagStr = tags.length > 0 ? ` [${tags.join(',')}]` : '';
      return `${i + 1}. (y:${line.yPct.toFixed(0)}% h:${line.heightPct.toFixed(1)}% conf:${line.confidence.toFixed(2)})${tagStr} "${line.text}"`;
    })
    .join('\n');
}

/* ------------------------------------------------------------------------ */
/*  LLM postprocessing                                                       */
/* ------------------------------------------------------------------------ */

const CLEAN_PROMPT_WITH_LAYOUT = `You are an OCR postprocessor for a children's reading app.
Given OCR lines with layout metadata from a scanned page, return ONLY the main readable text.

Each input line has: line number, (y%, h%, conf), optional [TAGS], then "text".
- y%: vertical position (0%=top, 100%=bottom of page)
- h%: text height relative to page (larger = heading/title font)
- conf: OCR confidence 0–1 (lower = noisier)
- Tags explain spatial context:
  [TOP] near top edge — likely header/running title
  [BOTTOM] near bottom edge — likely footer/page number
  [LARGE] text is bigger than body text — likely title or heading
  [CENTER] horizontally centred — often titles, page numbers, captions
  [INDENT] indented from the left margin — often a new paragraph
  [GAP] preceded by a large vertical gap — paragraph or section break
  [LOW-CONF] low OCR confidence — likely noise, watermark, or artefact

Rules:
- Remove lines that are headers, footers, or page numbers (use [TOP], [BOTTOM], [CENTER] + short text)
- Remove [LOW-CONF] text that looks like noise, watermarks, or artefacts
- Use [LARGE] / [CENTER] to identify titles — place on their own line with a blank line after
- Insert blank lines at [GAP] or [INDENT] boundaries to mark paragraph breaks
- Fix obvious OCR errors (e.g. "rn" → "m", "l" → "I" based on context)
- Do NOT add, rephrase, or summarise — keep the original wording
- Return the cleaned text only, no commentary or annotations`;

const CLEAN_PROMPT_PLAIN = `You are an OCR postprocessor for a children's reading app.
Given raw OCR lines from a scanned page, return ONLY the main readable text.

Rules:
- Remove page numbers, headers, footers, watermarks, URLs, copyright notices
- Remove stray symbols, OCR artifacts, and partial/garbled words
- If there is a title or heading, put it on its own line followed by a blank line
- Separate paragraphs with a blank line
- Fix obvious OCR errors (e.g. "rn" → "m", "l" → "I" in context)
- Do NOT add, rephrase, or summarise — keep the original wording
- Return the cleaned text only, no commentary`;

async function postprocessOcr(lines: string[], layoutLines?: LayoutLine[]): Promise<string> {
  if (lines.length === 0) return '';
  const hasLayout = layoutLines && layoutLines.length > 0;
  const systemPrompt = hasLayout ? CLEAN_PROMPT_WITH_LAYOUT : CLEAN_PROMPT_PLAIN;
  const userContent = hasLayout ? formatLayoutForLLM(layoutLines) : lines.join('\n');

  try {
    const data = await apiPost<unknown, { content: string }>('/openai/chat', {
      purpose: 'ocr-clean',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.1,
      max_tokens: 1000,
    });
    return data.content?.trim() || lines.join(' ');
  } catch {
    return lines.join(' ');
  }
}

/* ------------------------------------------------------------------------ */
/*  Main entry point                                                         */
/* ------------------------------------------------------------------------ */

interface VisionResponse {
  metadata?: { width?: number; height?: number };
  readResult?: unknown;
}

export async function recognizeText(imageDataUrl: string): Promise<OcrResult> {
  const blob = await prepareImage(imageDataUrl);
  const imageBase64 = await blobToBase64(blob);

  const data = await apiPost<unknown, VisionResponse>('/ocr/recognize', {
    imageBase64,
    mimeType: 'image/jpeg',
  });

  const imgWidth = data.metadata?.width ?? 0;
  const imgHeight = data.metadata?.height ?? 0;
  const layoutLines = extractLayoutLines(data.readResult, imgWidth, imgHeight);
  const lines = layoutLines.map((l) => l.text);

  const text = await postprocessOcr(lines, layoutLines);
  return { text, lines };
}
