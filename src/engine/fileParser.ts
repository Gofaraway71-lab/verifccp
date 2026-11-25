import { DecodedFileResult, LineEndingType } from '../types/ccp';

const INVISIBLE_CHARS_REGEX = /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF\u00A0\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/**
 * Détecte l'encodage d'un tampon binaire sans altérer les données d'origine.
 * Gère UTF-8, UTF-8 BOM, UTF-16 LE/BE, Windows-1256 (Arabe), Windows-1252 (Français ANSI).
 */
export function decodeBytesWithDetection(
  buffer: ArrayBuffer,
  forcedEncoding: 'UTF-8' | 'Windows-1252' | 'Windows-1256' | 'AUTO' = 'AUTO'
): { text: string; detectedEncoding: string; hasBom: boolean; hasReplacementChars: boolean } {
  const bytes = new Uint8Array(buffer);
  let hasBom = false;

  // Vérification des BOM
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    hasBom = true;
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(3));
    return {
      text,
      detectedEncoding: 'UTF-8 (avec BOM)',
      hasBom,
      hasReplacementChars: text.includes('\uFFFD'),
    };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    hasBom = true;
    const text = new TextDecoder('utf-16le', { fatal: false }).decode(bytes.subarray(2));
    return { text, detectedEncoding: 'UTF-16 LE', hasBom, hasReplacementChars: text.includes('\uFFFD') };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    hasBom = true;
    const text = new TextDecoder('utf-16be', { fatal: false }).decode(bytes.subarray(2));
    return { text, detectedEncoding: 'UTF-16 BE', hasBom, hasReplacementChars: text.includes('\uFFFD') };
  }

  if (forcedEncoding !== 'AUTO') {
    const encName =
      forcedEncoding === 'Windows-1256'
        ? 'windows-1256'
        : forcedEncoding === 'Windows-1252'
          ? 'windows-1252'
          : 'utf-8';
    const text = new TextDecoder(encName, { fatal: false }).decode(bytes);
    return {
      text,
      detectedEncoding: forcedEncoding,
      hasBom: false,
      hasReplacementChars: text.includes('\uFFFD'),
    };
  }

  // Test UTF-8 strict en premier
  try {
    const strictUtf8 = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const hasHighBytes = bytes.some((b) => b >= 0x80);
    return {
      text: strictUtf8,
      detectedEncoding: hasHighBytes ? 'UTF-8' : 'ASCII / UTF-8',
      hasBom: false,
      hasReplacementChars: false,
    };
  } catch {
    // Octets invalides en UTF-8 : heuristique Windows-1256 (arabe) vs Windows-1252 (français)
    let arabicRangeCount = 0;
    let highCount = 0;
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      if (b >= 0x80) {
        highCount++;
        // Plage des lettres arabes courantes dans Windows-1256 (0xC1..0xED)
        if (b >= 0xc1 && b <= 0xed) arabicRangeCount++;
      }
    }
    const likelyArabic = highCount > 0 && arabicRangeCount / highCount > 0.65;
    // Vérifier aussi les caractères accentués français fréquents (é=0xE9, è=0xE8, à=0xE0, ç=0xE7)
    let frenchAccentHits = 0;
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      if (b === 0xe9 || b === 0xe8 || b === 0xe0 || b === 0xe7 || b === 0xea || b === 0xf4 || b === 0xc9) {
        frenchAccentHits++;
      }
    }
    const useArabic = likelyArabic && frenchAccentHits < arabicRangeCount * 0.4;
    const chosen = useArabic ? 'windows-1256' : 'windows-1252';
    const text = new TextDecoder(chosen, { fatal: false }).decode(bytes);
    return {
      text,
      detectedEncoding: useArabic ? 'Windows-1256 (Arabe ANSI)' : 'Windows-1252 (ANSI)',
      hasBom: false,
      hasReplacementChars: text.includes('\uFFFD'),
    };
  }
}

export function detectLineEnding(text: string): LineEndingType {
  const crlfMatches = text.match(/\r\n/g)?.length ?? 0;
  const loneLfMatches = text.replace(/\r\n/g, '').match(/\n/g)?.length ?? 0;
  const loneCrMatches = text.replace(/\r\n/g, '').match(/\r/g)?.length ?? 0;
  if (crlfMatches === 0 && loneLfMatches === 0 && loneCrMatches === 0) return 'NONE';
  if (crlfMatches > 0 && loneLfMatches === 0 && loneCrMatches === 0) return 'CRLF';
  if (loneLfMatches > 0 && crlfMatches === 0 && loneCrMatches === 0) return 'LF';
  return 'MIXED';
}

export function splitRawLines(text: string): string[] {
  if (text.length === 0) return [];
  // Découpe en préservant les lignes exactes sans supprimer les espaces significatifs (largeur fixe!)
  const lines = text.split(/\r\n|\n|\r/);
  // Si le fichier se termine par un saut de ligne standard, la dernière entrée vide est l'EOF normal
  if (lines.length > 1 && lines[lines.length - 1] === '' && /(\r\n|\n|\r)$/.test(text)) {
    lines.pop();
  }
  return lines;
}

export function countInvisibleChars(text: string): number {
  const matches = text.match(INVISIBLE_CHARS_REGEX);
  return matches ? matches.length : 0;
}

export function stripInvisibleChars(line: string): string {
  return line.replace(INVISIBLE_CHARS_REGEX, '');
}

/**
 * Parseur CSV/TSV robuste respectant les guillemets échappés.
 */
export function parseDelimitedLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/**
 * Lecteur natif OOXML (.xlsx) 100 % local sans dépendance externe.
 * Extrait les entrées ZIP (méthodes Store 0 et Deflate 8 via DecompressionStream) et lit sheet1.xml + sharedStrings.xml.
 */
async function extractZipEntries(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const entries = new Map<string, Uint8Array>();

  // Localiser End of Central Directory (signature 0x06054b50)
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error('Archive XLSX invalide (signature ZIP introuvable).');
  }

  const cdEntries = view.getUint16(eocdOffset + 10, true);
  let cdOffset = view.getUint32(eocdOffset + 16, true);
  const decoder = new TextDecoder('utf-8');

  for (let i = 0; i < cdEntries; i++) {
    if (view.getUint32(cdOffset, true) !== 0x02014b50) break;
    const compressionMethod = view.getUint16(cdOffset + 10, true);
    const compressedSize = view.getUint32(cdOffset + 20, true);
    const nameLen = view.getUint16(cdOffset + 28, true);
    const extraLen = view.getUint16(cdOffset + 30, true);
    const commentLen = view.getUint16(cdOffset + 32, true);
    const localHeaderOffset = view.getUint32(cdOffset + 42, true);
    const name = decoder.decode(bytes.subarray(cdOffset + 46, cdOffset + 46 + nameLen));

    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const compressedSlice = bytes.subarray(dataStart, dataStart + compressedSize);

    if (compressionMethod === 0) {
      entries.set(name, compressedSlice);
    } else if (compressionMethod === 8 && typeof DecompressionStream !== 'undefined') {
      const ds = new DecompressionStream('deflate-raw');
      const writer = ds.writable.getWriter();
      writer.write(compressedSlice);
      writer.close();
      const chunks: Uint8Array[] = [];
      const reader = ds.readable.getReader();
      let totalLen = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        totalLen += value.length;
      }
      const out = new Uint8Array(totalLen);
      let pos = 0;
      for (const c of chunks) {
        out.set(c, pos);
        pos += c.length;
      }
      entries.set(name, out);
    }
    cdOffset += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

function colLettersToIndex(colRef: string): number {
  const letters = colRef.replace(/\d+/g, '').toUpperCase();
  let idx = 0;
  for (let i = 0; i < letters.length; i++) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return Math.max(0, idx - 1);
}

async function parseXlsxBuffer(buffer: ArrayBuffer): Promise<string[][]> {
  const entries = await extractZipEntries(buffer);
  const decoder = new TextDecoder('utf-8');
  const parser = new DOMParser();

  // Shared strings
  const sharedStrings: string[] = [];
  const ssBytes = entries.get('xl/sharedStrings.xml');
  if (ssBytes) {
    const ssDoc = parser.parseFromString(decoder.decode(ssBytes), 'application/xml');
    const siNodes = ssDoc.getElementsByTagName('si');
    for (let i = 0; i < siNodes.length; i++) {
      const tNodes = siNodes[i].getElementsByTagName('t');
      let text = '';
      for (let j = 0; j < tNodes.length; j++) {
        text += tNodes[j].textContent ?? '';
      }
      sharedStrings.push(text);
    }
  }

  // Première feuille disponible
  const sheetKey =
    entries.has('xl/worksheets/sheet1.xml')
      ? 'xl/worksheets/sheet1.xml'
      : Array.from(entries.keys()).find((k) => k.startsWith('xl/worksheets/sheet') && k.endsWith('.xml'));

  if (!sheetKey) {
    throw new Error('Aucune feuille Excel trouvée dans le classeur XLSX.');
  }

  const sheetDoc = parser.parseFromString(decoder.decode(entries.get(sheetKey)!), 'application/xml');
  const rowNodes = sheetDoc.getElementsByTagName('row');
  const rows: string[][] = [];

  for (let r = 0; r < rowNodes.length; r++) {
    const rowEl = rowNodes[r];
    const cellNodes = rowEl.getElementsByTagName('c');
    const rowArr: string[] = [];
    for (let c = 0; c < cellNodes.length; c++) {
      const cell = cellNodes[c];
      const ref = cell.getAttribute('r') ?? '';
      const colIdx = ref ? colLettersToIndex(ref) : c;
      const cellType = cell.getAttribute('t');
      let value = '';
      if (cellType === 's') {
        const vNode = cell.getElementsByTagName('v')[0];
        const idx = Number(vNode?.textContent ?? '-1');
        value = sharedStrings[idx] ?? '';
      } else if (cellType === 'inlineStr') {
        const tNode = cell.getElementsByTagName('t')[0];
        value = tNode?.textContent ?? '';
      } else {
        const vNode = cell.getElementsByTagName('v')[0];
        value = vNode?.textContent ?? '';
      }
      while (rowArr.length <= colIdx) rowArr.push('');
      rowArr[colIdx] = value;
    }
    rows.push(rowArr);
  }
  return rows;
}

/**
 * Lit un fichier importé (File) ou un texte brut sans jamais modifier le fichier original.
 */
export async function readAndDecodeFile(
  file: File,
  forcedEncoding: 'UTF-8' | 'Windows-1252' | 'Windows-1256' | 'AUTO' = 'AUTO'
): Promise<DecodedFileResult> {
  const fileName = file.name;
  const fileSize = file.size;
  const extMatch = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  const extension = extMatch ? extMatch[1] : 'txt';
  const buffer = await file.arrayBuffer();
  const parseWarnings: string[] = [];

  if (extension === 'xlsx') {
    try {
      const rows = await parseXlsxBuffer(buffer);
      const rawLines = rows.map((r) => r.join(';'));
      return {
        fileName,
        fileSize,
        extension,
        rawText: rawLines.join('\r\n'),
        detectedEncoding: 'XLSX (OOXML UTF-8)',
        hasBom: false,
        hasReplacementChars: false,
        invisibleCharCount: countInvisibleChars(rawLines.join('\n')),
        lineEnding: 'NONE',
        rawLines,
        spreadsheetRows: rows,
        parseWarnings,
      };
    } catch (err) {
      parseWarnings.push(
        `Lecture XLSX échouée (${err instanceof Error ? err.message : 'erreur inconnue'}). Bascule en lecture texte.`
      );
    }
  }

  if (extension === 'xls') {
    // Détection Excel HTML/XML Spreadsheet (.xls texte exporté par certains logiciels de paie) vs binaire BIFF
    const probe = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(buffer.slice(0, 512)));
    if (probe.trim().startsWith('<')) {
      const decoded = decodeBytesWithDetection(buffer, forcedEncoding);
      const doc = new DOMParser().parseFromString(decoded.text, 'text/html');
      const trs = Array.from(doc.querySelectorAll('tr'));
      if (trs.length > 0) {
        const rows = trs.map((tr) =>
          Array.from(tr.querySelectorAll('td,th')).map((cell) => (cell.textContent ?? '').trim())
        );
        const rawLines = rows.map((r) => r.join(';'));
        return {
          fileName,
          fileSize,
          extension,
          rawText: rawLines.join('\r\n'),
          detectedEncoding: `${decoded.detectedEncoding} (Tableur XLS/HTML)`,
          hasBom: decoded.hasBom,
          hasReplacementChars: decoded.hasReplacementChars,
          invisibleCharCount: countInvisibleChars(rawLines.join('\n')),
          lineEnding: 'NONE',
          rawLines,
          spreadsheetRows: rows,
          parseWarnings,
        };
      }
    }
    parseWarnings.push(
      'Le format binaire hérité Excel 97-2003 (.xls) n’est pas lisible nativement hors ligne ; enregistrez le classeur en .xlsx ou .csv pour une analyse exacte.'
    );
  }

  const decoded = decodeBytesWithDetection(buffer, forcedEncoding);
  const lineEnding = detectLineEnding(decoded.text);
  const rawLines = splitRawLines(decoded.text);
  const invisibleCharCount = countInvisibleChars(decoded.text);

  return {
    fileName,
    fileSize,
    extension,
    rawText: decoded.text,
    detectedEncoding: decoded.detectedEncoding,
    hasBom: decoded.hasBom,
    hasReplacementChars: decoded.hasReplacementChars,
    invisibleCharCount,
    lineEnding,
    rawLines,
    parseWarnings,
  };
}

export function decodeRawStringAsFile(fileName: string, content: string): DecodedFileResult {
  const bytes = new TextEncoder().encode(content);
  const hasBom = content.startsWith('\uFEFF');
  const cleanText = hasBom ? content.slice(1) : content;
  return {
    fileName,
    fileSize: bytes.byteLength,
    extension: fileName.split('.').pop()?.toLowerCase() || 'txt',
    rawText: cleanText,
    detectedEncoding: hasBom ? 'UTF-8 (avec BOM)' : 'UTF-8',
    hasBom,
    hasReplacementChars: cleanText.includes('\uFFFD'),
    invisibleCharCount: countInvisibleChars(cleanText),
    lineEnding: detectLineEnding(cleanText),
    rawLines: splitRawLines(cleanText),
    parseWarnings: [],
  };
}
