import { AnalysisReport, Severity } from '../types/ccp';
import { formatDZD, formatFileSize, maskAccountNumber, maskSensitiveInText } from './cryptoKeys';
import { buildComplianceReportPdfBlob, triggerPdfDownload } from './pdfReportGenerator';

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Erreur critique',
  error: 'Erreur',
  warning: 'Avertissement',
  info: 'Information',
};

const STATUS_LABEL = {
  conforme: 'CONFORME',
  'non-conforme': 'NON CONFORME',
  'a-verifier': 'A VERIFIER',
};

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '_');
}

function escapeCsvCell(value: string): string {
  const s = value.replace(/\r?\n/g, ' ');
  if (s.includes(';') || s.includes('"') || s.includes(',')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * 1. Export CSV (UTF-8 avec BOM pour ouverture directe dans Microsoft Excel en français)
 */
export function exportAnomaliesCSV(report: AnalysisReport, privacyMode: boolean): void {
  const headers = [
    'Code Règle',
    'Ligne',
    'Identifiant',
    'Champ',
    'Gravité',
    'Catégorie',
    'Valeur détectée',
    'Règle attendue',
    'Description',
    'Suggestion',
  ];

  const rows = report.anomalies.map((a) => [
    a.ruleCode,
    a.lineNumber === 0 ? 'Global' : String(a.lineNumber),
    maskAccountNumber(a.recordIdentifier, privacyMode),
    a.field,
    SEVERITY_LABEL[a.severity],
    a.category,
    maskSensitiveInText(a.detectedValue, privacyMode),
    a.expectedRule,
    maskSensitiveInText(a.description, privacyMode),
    a.suggestion ?? '',
  ]);

  const csvLines = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(';'));
  const content = '\uFEFF' + csvLines.join('\r\n');
  downloadBlob(
    new Blob([content], { type: 'text/csv;charset=utf-8' }),
    `anomalies_${baseName(report.fileName)}.csv`
  );
}

/**
 * 2. Générateur binaire natif OOXML (.xlsx) 100 % local avec CRC-32 conforme ZIP.
 * Produit un classeur Excel réel à 2 onglets : "Synthèse" et "Anomalies".
 */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function xmlEscape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function colRef(idx: number): string {
  let n = idx + 1;
  let res = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    res = String.fromCharCode(65 + rem) + res;
    n = Math.floor((n - 1) / 26);
  }
  return res;
}

function buildWorksheetXml(rows: string[][]): string {
  const rowXml = rows
    .map((cells, rIdx) => {
      const cellsXml = cells
        .map((val, cIdx) => {
          const ref = `${colRef(cIdx)}${rIdx + 1}`;
          const styleAttr = rIdx === 0 ? ' s="1"' : '';
          return `<c r="${ref}" t="inlineStr"${styleAttr}><is><t xml:space="preserve">${xmlEscape(val)}</t></is></c>`;
        })
        .join('');
      return `<row r="${rIdx + 1}">${cellsXml}</row>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${rowXml}</sheetData>
</worksheet>`;
}

export function buildZipStore(
  files: Array<{ name: string; content: string | Uint8Array }>
): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const cdParts: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const dataBytes = typeof f.content === 'string' ? enc.encode(f.content) : f.content;
    const crc = crc32(dataBytes);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8
    lv.setUint16(8, 0, true); // Store
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, dataBytes.length, true);
    lv.setUint32(22, dataBytes.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, dataBytes);

    const cdHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cdHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, dataBytes.length, true);
    cv.setUint32(24, dataBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    cdHeader.set(nameBytes, 46);
    cdParts.push(cdHeader);

    offset += localHeader.length + dataBytes.length;
  }

  const cdSize = cdParts.reduce((s, p) => s + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalLen = offset + cdSize + 22;
  const out = new Uint8Array(new ArrayBuffer(totalLen));
  let pos = 0;
  for (const p of localParts) {
    out.set(p, pos);
    pos += p.length;
  }
  for (const p of cdParts) {
    out.set(p, pos);
    pos += p.length;
  }
  out.set(eocd, pos);
  return out;
}

export function exportAnomaliesXLSX(report: AnalysisReport, privacyMode: boolean): void {
  const summaryRows: string[][] = [
    ['Indicateur', 'Valeur'],
    ['Fichier analysé', report.fileName],
    ['Taille', formatFileSize(report.fileSize)],
    ['Date d’analyse', new Date(report.analyzedAt).toLocaleString('fr-FR')],
    ['Profil appliqué', report.profileName],
    ['Format contrôlé', report.profileFormat === 'rip' ? 'RIP (00799999)' : report.profileFormat === 'rib' ? 'RIB Bancaire (Mod 97)' : 'non-RIP (00000000)'],
    ['Statut général', STATUS_LABEL[report.status]],
    ['Encodage détecté', report.decoded.detectedEncoding],
    ['Total lignes', String(report.summary.totalLines)],
    ['Nombre de bénéficiaires', String(report.summary.beneficiaryCount)],
    ['Enregistrements valides', String(report.summary.validRecords)],
    ['Enregistrements invalides', String(report.summary.invalidRecords)],
    ['Montant total calculé', formatDZD(report.summary.computedTotalCentimes)],
    [
      'Montant global déclaré (Ligne 1)',
      report.summary.declaredTotalCentimes !== null ? formatDZD(report.summary.declaredTotalCentimes) : 'Non applicable',
    ],
    ['Erreurs critiques', String(report.summary.countsBySeverity.critical)],
    ['Erreurs', String(report.summary.countsBySeverity.error)],
    ['Avertissements', String(report.summary.countsBySeverity.warning)],
    ['Informations', String(report.summary.countsBySeverity.info)],
    ['Mode confidentialité export', privacyMode ? 'Activé (comptes masqués)' : 'Désactivé'],
  ];

  const anomalyRows: string[][] = [
    [
      'Code Règle',
      'Ligne',
      'Identifiant',
      'Champ concerné',
      'Gravité',
      'Catégorie',
      'Valeur détectée',
      'Règle attendue',
      'Description',
      'Suggestion',
    ],
    ...report.anomalies.map((a) => [
      a.ruleCode,
      a.lineNumber === 0 ? 'Global' : String(a.lineNumber),
      maskAccountNumber(a.recordIdentifier, privacyMode),
      a.field,
      SEVERITY_LABEL[a.severity],
      a.category,
      maskSensitiveInText(a.detectedValue, privacyMode),
      a.expectedRule,
      maskSensitiveInText(a.description, privacyMode),
      a.suggestion ?? '',
    ]),
  ];

  const zipBytes = buildZipStore([
    {
      name: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
    },
    {
      name: '_rels/.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Synthese" sheetId="1" r:id="rId1"/>
    <sheet name="Anomalies" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    {
      name: 'xl/styles.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="10"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0F2942"/></patternFill></fill>
  </fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
  </cellXfs>
</styleSheet>`,
    },
    { name: 'xl/worksheets/sheet1.xml', content: buildWorksheetXml(summaryRows) },
    { name: 'xl/worksheets/sheet2.xml', content: buildWorksheetXml(anomalyRows) },
  ]);

  downloadBlob(
    new Blob([zipBytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `rapport_conformite_${baseName(report.fileName)}.xlsx`
  );
}

/**
 * 3. Export rapide du rapport complet en PDF (délègue au module dédié pdfReportGenerator).
 */
export function exportReportPDF(report: AnalysisReport, privacyMode: boolean): void {
  const generated = buildComplianceReportPdfBlob(report, report.anomalies, {
    privacyMode,
    scope: 'all',
    includeStatsBreakdown: true,
    includeSuggestions: true,
    includeDetectionDetails: true,
    organizationName: '',
    operatorNote: '',
  });
  triggerPdfDownload(generated);
}

/**
 * 4. Export des lignes conformes uniquement
 */
export function exportValidLinesTXT(report: AnalysisReport): void {
  const eol = report.safeCorrection.targetLineEnding === 'LF' ? '\n' : '\r\n';
  const validLines = report.records
    .filter((r) => r.kind !== 'empty' && !r.hasCriticalOrError)
    .map((r) => r.rawLine);
  downloadBlob(
    new Blob([validLines.join(eol)], { type: 'text/plain;charset=utf-8' }),
    `lignes_conformes_${baseName(report.fileName)}.txt`
  );
}

/**
 * 5. Export des lignes non conformes uniquement (pour correction ciblée)
 */
export function exportInvalidLinesTXT(report: AnalysisReport): void {
  const eol = report.safeCorrection.targetLineEnding === 'LF' ? '\n' : '\r\n';
  const invalidLines = report.records
    .filter((r) => r.hasCriticalOrError)
    .map((r) => r.rawLine);
  downloadBlob(
    new Blob([invalidLines.join(eol)], { type: 'text/plain;charset=utf-8' }),
    `lignes_non_conformes_${baseName(report.fileName)}.txt`
  );
}

/**
 * 6. Export du fichier nettoyé (corrections sûres uniquement, après confirmation utilisateur)
 */
export function exportSafeCorrectedTXT(report: AnalysisReport): void {
  downloadBlob(
    new Blob([report.safeCorrection.correctedContent], { type: 'text/plain;charset=utf-8' }),
    `nettoye_${baseName(report.fileName)}.txt`
  );
}
