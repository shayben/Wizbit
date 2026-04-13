/**
 * ebookService – extract readable text from PDF and EPUB files.
 *
 * PDF  → pdfjs-dist  (page-by-page text extraction)
 * EPUB → jszip + DOMParser (first-chapter HTML → plain text)
 *
 * Both formats truncate output to MAX_CHARS characters at a word
 * boundary so reading sessions stay a manageable length.
 */

import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';

// Point PDF.js at its bundled worker (resolved by Vite at build time).
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href;

/** Maximum number of characters to return from any ebook. */
const MAX_CHARS = 4000;

/**
 * Buffer factor for early-exit checks during page/chapter iteration.
 * We collect slightly more than MAX_CHARS before truncating so that
 * the word-boundary truncation always has enough material to work with.
 */
const MAX_CHARS_BUFFER = MAX_CHARS * 1.5;

/** Truncate text at the last word boundary within maxLen characters. */
function truncateAtWord(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const cut = text.lastIndexOf(' ', maxLen);
  return cut > 0 ? text.slice(0, cut) : text.slice(0, maxLen);
}

// ── PDF ──────────────────────────────────────────────────────────────────────

async function extractFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const parts: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    parts.push(pageText);

    // Stop early if we already have enough raw characters.
    if (parts.join(' ').length >= MAX_CHARS_BUFFER) break;
  }

  return truncateAtWord(parts.join('\n').replace(/\s+/g, ' ').trim(), MAX_CHARS);
}

// ── EPUB ─────────────────────────────────────────────────────────────────────

/** Parse an XML/HTML string and return its text content. */
function xmlToText(xmlString: string): string {
  const doc = new DOMParser().parseFromString(xmlString, 'application/xhtml+xml');
  // Remove script / style noise
  doc.querySelectorAll('script, style, head').forEach((el) => el.remove());
  return (doc.body?.textContent ?? doc.documentElement.textContent ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function extractFromEpub(file: File): Promise<string> {
  const zip = await JSZip.loadAsync(file);

  // 1. Find the OPF path from META-INF/container.xml
  const containerXmlFile = zip.file('META-INF/container.xml');
  if (!containerXmlFile) throw new Error('Invalid EPUB: missing META-INF/container.xml');

  const containerXml = await containerXmlFile.async('text');
  const containerDoc = new DOMParser().parseFromString(containerXml, 'application/xml');
  const rootfileEl = containerDoc.querySelector('rootfile');
  const opfPath = rootfileEl?.getAttribute('full-path');
  if (!opfPath) throw new Error('Invalid EPUB: cannot find OPF path');

  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';

  // 2. Parse the OPF to get spine order
  const opfFile = zip.file(opfPath);
  if (!opfFile) throw new Error('Invalid EPUB: missing OPF file');

  const opfXml = await opfFile.async('text');
  const opfDoc = new DOMParser().parseFromString(opfXml, 'application/xml');

  // Build id → href map from <manifest>
  const manifestItems = new Map<string, string>();
  opfDoc.querySelectorAll('manifest > item').forEach((item) => {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (id && href) manifestItems.set(id, href);
  });

  // Get spine item refs in order
  const spineRefs: string[] = [];
  opfDoc.querySelectorAll('spine > itemref').forEach((ref) => {
    const idref = ref.getAttribute('idref');
    if (idref) spineRefs.push(idref);
  });

  // 3. Extract text from spine items until we have enough
  const parts: string[] = [];
  for (const idref of spineRefs) {
    const href = manifestItems.get(idref);
    if (!href) continue;

    const chapterPath = opfDir + href.split('#')[0]; // strip fragment
    const chapterFile = zip.file(chapterPath) ?? zip.file(href.split('#')[0]);
    if (!chapterFile) continue;

    const html = await chapterFile.async('text');
    const text = xmlToText(html);
    if (text.length > 0) parts.push(text);

    if (parts.join(' ').length >= MAX_CHARS_BUFFER) break;
  }

  if (parts.length === 0) throw new Error('No readable text found in EPUB');

  return truncateAtWord(parts.join('\n').replace(/\s+/g, ' ').trim(), MAX_CHARS);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Extract plain text from a PDF or EPUB file.
 * Throws an error if the file type is not supported or extraction fails.
 */
export async function extractFromEbook(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return extractFromPdf(file);
  if (name.endsWith('.epub')) return extractFromEpub(file);
  throw new Error('Unsupported file type. Please choose a .pdf or .epub file.');
}
