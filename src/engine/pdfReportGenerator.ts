import { AnalysisReport, Anomaly, AnomalyCategory, Severity } from '../types/ccp';
import { formatDZD, formatFileSize, maskAccountNumber, maskSensitiveInText } from './cryptoKeys';

export interface PdfReportOptions {
  privacyMode: boolean;
  scope: 'all' | 'filtered';
  includeStatsBreakdown: boolean;
  includeSuggestions: boolean;
  includeDetectionDetails: boolean;
  organizationName: string;
  operatorNote: string;
  maxAnomalies?: number;
}

export interface GeneratedPdfResult {
  blob: Blob;
  fileName: string;
  pageCount: number;
  includedAnomaliesCount: number;
  totalAnomaliesInScope: number;
  sizeBytes: number;
}

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Erreur critique',
  error: 'Erreur',
  warning: 'Avertissement',
  info: 'Information',
};

const CATEGORY_LABEL: Record<AnomalyCategory, string> = {
  structure: 'Structure (longueur, *, type)',
  rip: 'Regles format RIP (00799999)',
  'non-rip': 'Regles format non-RIP (00000000)',
  key: 'Cles de controle (RIP / CCP)',
  amount: 'Montants (format et validite)',
  coherence: 'Coherence globale (totaux / nb)',
  duplicate: 'Doublons et lignes repetees',
  field: 'Champs (periode, noms, espaces)',
  encoding: 'Encodage, BOM et fins de ligne',
};

const STATUS_LABEL: Record<AnalysisReport['status'], string> = {
  conforme: 'CONFORME - PRET POUR TRANSMISSION',
  'non-conforme': 'NON CONFORME - CORRECTIONS REQUISES',
  'a-verifier': 'A VERIFIER - AVERTISSEMENTS DETECTES',
};

function sanitizeBaseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '_');
}

/**
 * Convertit une chaîne UTF-8 vers WinAnsiEncoding compatible PDF Type 1 (Helvetica / Courier).
 */
function toPdfWinAnsi(input: string): string {
  const normalized = input
    .replace(/\u202F|\u00A0/g, ' ')
    .replace(/[«»]/g, '"')
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/•/g, '*')
    .replace(/→/g, '->')
    .replace(/×/g, 'x')
    .replace(/∅/g, '(vide)');

  let out = '';
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    if (code === 0x28 || code === 0x29 || code === 0x5c) {
      out += '\\' + normalized[i];
    } else if (code >= 0x20 && code <= 0x7e) {
      out += normalized[i];
    } else if (code >= 0xa0 && code <= 0xff) {
      out += '\\' + code.toString(8).padStart(3, '0');
    } else {
      out += '?';
    }
  }
  return out;
}

function wrapText(text: string, maxChars: number): string[] {
  const clean = text.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return [''];
  const words = clean.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const w of words) {
    if (w.length > maxChars) {
      if (current) {
        lines.push(current);
        current = '';
      }
      for (let i = 0; i < w.length; i += maxChars) {
        const chunk = w.slice(i, i + maxChars);
        if (chunk.length === maxChars) {
          lines.push(chunk);
        } else {
          current = chunk;
        }
      }
      continue;
    }

    if (!current) {
      current = w;
    } else if (current.length + 1 + w.length <= maxChars) {
      current += ' ' + w;
    } else {
      lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Génère un fichier PDF 1.4 binaire complet, 100 % local et hors ligne,
 * contenant les statistiques complètes et la liste détaillée des anomalies.
 */
export function buildComplianceReportPdfBlob(
  report: AnalysisReport,
  anomaliesSource: Anomaly[],
  options: PdfReportOptions
): GeneratedPdfResult {
  const pageWidth = 595.28; // A4 portrait
  const pageHeight = 841.89;
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;
  const maxRows = options.maxAnomalies ?? 1500;
  const anomalies = anomaliesSource.slice(0, maxRows);

  const pagesContent: string[] = [];
  let cmds: string[] = [];
  let y = pageHeight - margin;

  const pushText = (
    x: number,
    yPos: number,
    size: number,
    font: 'F1' | 'F2' | 'F3',
    text: string,
    rgb = '0.06 0.09 0.16'
  ) => {
    cmds.push(
      `BT /${font} ${size} Tf ${rgb} rg ${x.toFixed(2)} ${yPos.toFixed(2)} Td (${toPdfWinAnsi(text)}) Tj ET`
    );
  };

  const pushRect = (x: number, yPos: number, w: number, h: number, fillRgb: string) => {
    cmds.push(`q ${fillRgb} rg ${x.toFixed(2)} ${yPos.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f Q`);
  };

  const pushStrokeRect = (x: number, yPos: number, w: number, h: number, strokeRgb = '0.84 0.87 0.91') => {
    cmds.push(`q ${strokeRgb} RG 0.6 w ${x.toFixed(2)} ${yPos.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S Q`);
  };

  const pushLine = (x1: number, y1: number, x2: number, y2: number, strokeRgb = '0.85 0.88 0.92') => {
    cmds.push(`q ${strokeRgb} RG 0.6 w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S Q`);
  };

  const startNewPage = (isFirst: boolean) => {
    if (!isFirst) {
      pagesContent.push(cmds.join('\n'));
      cmds = [];
    }
    // Bandeau institutionnel haut de page
    pushRect(0, pageHeight - 62, pageWidth, 62, '0.06 0.16 0.26');
    pushText(margin, pageHeight - 26, 13, 'F2', 'VerifCCP - Rapport de Conformite CCP Algerie Poste', '1 1 1');
    const subHeader = [
      `Fichier : ${report.fileName}`,
      `Format : ${report.profileFormat === 'rip' ? 'RIP (00799999)' : report.profileFormat === 'rib' ? 'RIB Bancaire (Mod 97)' : 'non-RIP (00000000)'}`,
      `Date : ${new Date(report.analyzedAt).toLocaleString('fr-FR')}`,
    ].join('  |  ');
    pushText(margin, pageHeight - 44, 8, 'F1', subHeader.slice(0, 108), '0.80 0.86 0.93');
    if (options.organizationName.trim()) {
      pushText(
        margin,
        pageHeight - 55,
        7.5,
        'F1',
        `Service : ${options.organizationName.trim().slice(0, 90)}`,
        '0.92 0.80 0.50'
      );
    }
    y = pageHeight - 82;
  };

  const ensureSpace = (neededHeight: number) => {
    if (y - neededHeight < 52) {
      startNewPage(false);
      return true;
    }
    return false;
  };

  const drawSectionTitle = (title: string) => {
    ensureSpace(34);
    pushText(margin, y, 10.5, 'F2', title, '0.06 0.16 0.26');
    y -= 6;
    pushLine(margin, y, pageWidth - margin, y, '0.06 0.16 0.26');
    y -= 14;
  };

  startNewPage(true);

  // ── Bandeau Verdict de Conformité ──
  const statusRgb =
    report.status === 'conforme'
      ? '0.08 0.50 0.24'
      : report.status === 'a-verifier'
        ? '0.70 0.33 0.04'
        : '0.73 0.11 0.11';
  const statusBg =
    report.status === 'conforme'
      ? '0.94 0.98 0.95'
      : report.status === 'a-verifier'
        ? '0.99 0.97 0.92'
        : '0.99 0.94 0.94';

  pushRect(margin, y - 38, contentWidth, 38, statusBg);
  pushStrokeRect(margin, y - 38, contentWidth, 38, '0.82 0.85 0.90');
  pushText(margin + 12, y - 14, 7.5, 'F2', 'STATUT GENERAL DU CONTROLE', '0.38 0.44 0.52');
  pushText(margin + 12, y - 29, 11.5, 'F2', STATUS_LABEL[report.status], statusRgb);
  pushText(
    pageWidth - margin - 185,
    y - 16,
    8,
    'F1',
    `Reference : ${report.id}`,
    '0.35 0.41 0.50'
  );
  pushText(
    pageWidth - margin - 185,
    y - 28,
    8,
    'F1',
    `Confidentialite : ${options.privacyMode ? 'Comptes masques' : 'Affichage complet'}`,
    '0.35 0.41 0.50'
  );
  y -= 54;

  // ── 4 Cartes KPI Chiffrées ──
  const complianceRate =
    report.summary.nonEmptyLines > 0
      ? ((report.summary.validRecords / report.summary.nonEmptyLines) * 100).toFixed(1)
      : '0.0';
  const kpis = [
    {
      label: 'Lignes analysees',
      value: `${report.summary.nonEmptyLines}`,
      sub: `${report.summary.beneficiaryCount} beneficiaire(s)`,
    },
    {
      label: 'Taux de conformite',
      value: `${complianceRate} %`,
      sub: `${report.summary.validRecords} valides / ${report.summary.invalidRecords} invalides`,
    },
    {
      label: 'Montant total calcule',
      value: formatDZD(report.summary.computedTotalCentimes),
      sub:
        report.summary.declaredTotalCentimes !== null
          ? report.summary.declaredTotalCentimes === report.summary.computedTotalCentimes
            ? 'Egal au total Ligne 1'
            : `Ligne 1 : ${formatDZD(report.summary.declaredTotalCentimes)}`
          : 'Somme des lignes',
    },
    {
      label: 'Anomalies detectees',
      value: `${report.anomalies.length}`,
      sub: `${report.summary.countsBySeverity.critical} crit. / ${report.summary.countsBySeverity.error} err. / ${report.summary.countsBySeverity.warning} av.`,
    },
  ];

  const cardGap = 8;
  const cardW = (contentWidth - cardGap * 3) / 4;
  kpis.forEach((k, i) => {
    const cx = margin + i * (cardW + cardGap);
    pushRect(cx, y - 46, cardW, 46, '0.97 0.98 0.99');
    pushStrokeRect(cx, y - 46, cardW, 46, '0.86 0.89 0.92');
    pushText(cx + 8, y - 13, 7.5, 'F1', k.label, '0.40 0.46 0.54');
    pushText(cx + 8, y - 28, 10.5, 'F2', k.value.slice(0, 18), '0.06 0.16 0.26');
    pushText(cx + 8, y - 40, 6.8, 'F1', k.sub.slice(0, 26), '0.45 0.50 0.58');
  });
  y -= 64;

  // ── Section 1 : Synthèse du fichier & contrôle global ──
  drawSectionTitle('1. Synthese du fichier et controles globaux');

  const detailsLeft: Array<[string, string]> = [
    ['Fichier source', `${report.fileName} (${formatFileSize(report.fileSize)})`],
    ['Profil applique', report.profileName],
    ['Format controle', report.profileFormat === 'rip' ? 'Format RIP (prefixe 00799999)' : report.profileFormat === 'rib' ? 'Format RIB Bancaire (Mod 97)' : 'Format non-RIP (prefixe 00000000)'],
    ['Compte ordonnateur', report.summary.ordonnateurAccount ? maskAccountNumber(report.summary.ordonnateurAccount, options.privacyMode) : 'Non applicable'],
    ['Periode declaree (L1)', report.summary.headerPeriod ?? 'Non specifiee'],
  ];

  const detailsRight: Array<[string, string]> = [
    ['Beneficiaires (reel / L1)', `${report.summary.beneficiaryCount} / ${report.summary.declaredBeneficiaryCount ?? 'N/A'}`],
    ['Doublons / Lignes repetees', `${report.summary.duplicateAccounts} doublon(s) / ${report.summary.repeatedLines} repetee(s)`],
    ['Duree d\'analyse locale', `${report.durationMs} ms`],
    ...(options.includeDetectionDetails
      ? ([
          ['Detection automatique', `${report.detection.detectedFormat} (confiance ${report.detection.confidence} %)`],
          ['Encodage / Fins de ligne', `${report.decoded.detectedEncoding} / ${report.decoded.lineEnding}`],
        ] as Array<[string, string]>)
      : []),
  ];

  const maxInfoRows = Math.max(detailsLeft.length, detailsRight.length);
  for (let i = 0; i < maxInfoRows; i++) {
    ensureSpace(16);
    if (detailsLeft[i]) {
      pushText(margin, y, 8, 'F2', `${detailsLeft[i][0]} :`, '0.35 0.41 0.50');
      pushText(margin + 96, y, 8, 'F1', detailsLeft[i][1].slice(0, 34));
    }
    if (detailsRight[i]) {
      pushText(margin + 266, y, 8, 'F2', `${detailsRight[i][0]} :`, '0.35 0.41 0.50');
      pushText(margin + 372, y, 8, 'F1', detailsRight[i][1].slice(0, 30));
    }
    y -= 14;
  }
  y -= 10;

  // ── Section 2 : Statistiques détaillées des anomalies ──
  if (options.includeStatsBreakdown) {
    drawSectionTitle('2. Statistiques detaillees par gravite et par categorie');
    ensureSpace(122);

    const startStatsY = y;
    const totalAnom = Math.max(1, report.anomalies.length);

    // Colonne gauche : Gravité avec barres vectorielles
    pushText(margin, y, 8.5, 'F2', 'Repartition par niveau de gravite', '0.15 0.22 0.30');
    let ly = y - 16;
    const severities: Array<{ key: Severity; rgb: string }> = [
      { key: 'critical', rgb: '0.73 0.11 0.11' },
      { key: 'error', rgb: '0.86 0.24 0.18' },
      { key: 'warning', rgb: '0.82 0.47 0.04' },
      { key: 'info', rgb: '0.20 0.45 0.68' },
    ];
    for (const s of severities) {
      const count = report.summary.countsBySeverity[s.key];
      const pct = report.anomalies.length > 0 ? Math.round((count / totalAnom) * 100) : 0;
      pushText(margin, ly, 8, 'F1', SEVERITY_LABEL[s.key], '0.20 0.26 0.34');
      pushText(margin + 185, ly, 8, 'F3', `${String(count).padStart(4, ' ')} (${pct}%)`, '0.12 0.16 0.22');
      // Barre fond + remplissage
      pushRect(margin + 88, ly + 1, 90, 6, '0.92 0.94 0.96');
      if (count > 0) {
        const barW = Math.max(3, (count / totalAnom) * 90);
        pushRect(margin + 88, ly + 1, barW, 6, s.rgb);
      }
      ly -= 16;
    }

    // Colonne droite : Catégories actives
    pushText(margin + 266, startStatsY, 8.5, 'F2', 'Repartition par type d\'anomalie', '0.15 0.22 0.30');
    let ry = startStatsY - 16;
    const catKeys = Object.keys(CATEGORY_LABEL) as AnomalyCategory[];
    const nonZeroCats = catKeys.filter((c) => report.summary.countsByCategory[c] > 0);
    const catsToShow = nonZeroCats.length > 0 ? nonZeroCats : catKeys.slice(0, 4);

    for (const c of catsToShow.slice(0, 7)) {
      const count = report.summary.countsByCategory[c];
      pushText(margin + 266, ry, 7.8, 'F1', CATEGORY_LABEL[c].slice(0, 34), '0.20 0.26 0.34');
      pushText(margin + 474, ry, 8, 'F3', String(count).padStart(4, ' '), count > 0 ? '0.73 0.11 0.11' : '0.45 0.50 0.58');
      ry -= 13;
    }

    y = Math.min(ly, ry) - 10;
  }

  // ── Section 3 : Liste complète des anomalies ──
  const sectionNumber = options.includeStatsBreakdown ? '3' : '2';
  const scopeLabel =
    options.scope === 'filtered'
      ? `${anomaliesSource.length} anomalie(s) filtree(s) sur ${report.anomalies.length}`
      : `${report.anomalies.length} anomalie(s) detectee(s)`;
  drawSectionTitle(`${sectionNumber}. Liste des anomalies (${scopeLabel})`);

  if (anomalies.length === 0) {
    ensureSpace(26);
    pushRect(margin, y - 22, contentWidth, 22, '0.94 0.98 0.95');
    pushText(
      margin + 10,
      y - 14,
      8.5,
      'F2',
      'Aucune anomalie dans le perimetre selectionne. Le fichier respecte les regles actives du profil.',
      '0.08 0.50 0.24'
    );
    y -= 34;
  } else {
    const drawAnomaliesHeader = () => {
      pushRect(margin, y - 16, contentWidth, 18, '0.06 0.16 0.26');
      pushText(margin + 5, y - 11, 7.8, 'F2', 'Ligne', '1 1 1');
      pushText(margin + 40, y - 11, 7.8, 'F2', 'Gravite / Code', '1 1 1');
      pushText(margin + 122, y - 11, 7.8, 'F2', 'Champ / Compte', '1 1 1');
      pushText(margin + 235, y - 11, 7.8, 'F2', 'Valeur & Description de l\'anomalie', '1 1 1');
      y -= 26;
    };

    ensureSpace(46);
    drawAnomaliesHeader();

    for (let i = 0; i < anomalies.length; i++) {
      const a = anomalies[i];
      const detectedMasked = maskSensitiveInText(a.detectedValue, options.privacyMode);
      const descMasked = maskSensitiveInText(a.description, options.privacyMode);
      const idMasked = maskAccountNumber(a.recordIdentifier, options.privacyMode);

      const mainText = `Detecte : ${detectedMasked} | ${descMasked}`;
      const wrappedDesc = wrapText(mainText, 58);
      const wrappedSugg =
        options.includeSuggestions && a.suggestion
          ? wrapText(`Suggestion : ${a.suggestion}`, 58)
          : [];

      const totalTextLines = Math.max(2, wrappedDesc.length + wrappedSugg.length);
      const rowHeight = totalTextLines * 9.5 + 10;

      if (ensureSpace(rowHeight + 6)) {
        drawAnomaliesHeader();
      }

      if (i % 2 === 1) {
        pushRect(margin, y - rowHeight + 8, contentWidth, rowHeight, '0.98 0.98 0.99');
      }

      const sevColor =
        a.severity === 'critical'
          ? '0.73 0.11 0.11'
          : a.severity === 'error'
            ? '0.82 0.18 0.15'
            : a.severity === 'warning'
              ? '0.70 0.33 0.04'
              : '0.20 0.42 0.65';

      pushText(margin + 5, y, 8, 'F3', a.lineNumber === 0 ? 'GLOB' : String(a.lineNumber));
      pushText(margin + 40, y, 7.6, 'F2', SEVERITY_LABEL[a.severity], sevColor);
      pushText(margin + 40, y - 9.5, 7, 'F3', a.ruleCode, '0.45 0.50 0.58');

      pushText(margin + 122, y, 7.6, 'F2', a.field.slice(0, 22));
      pushText(margin + 122, y - 9.5, 6.8, 'F3', idMasked.slice(0, 22), '0.42 0.48 0.56');

      let ty = y;
      for (const line of wrappedDesc) {
        pushText(margin + 235, ty, 7.6, 'F1', line, '0.10 0.14 0.20');
        ty -= 9.5;
      }
      for (const line of wrappedSugg) {
        pushText(margin + 235, ty, 7.2, 'F1', line, '0.35 0.42 0.52');
        ty -= 9.5;
      }

      y -= rowHeight;
      pushLine(margin, y + 7, pageWidth - margin, y + 7, '0.91 0.93 0.96');
    }

    if (anomaliesSource.length > anomalies.length) {
      ensureSpace(24);
      pushText(
        margin,
        y - 4,
        8,
        'F2',
        `Note : ${anomaliesSource.length - anomalies.length} anomalies supplementaires non imprimees (limite PDF : ${maxRows}). Exportez en Excel (.xlsx) ou CSV pour la liste integrale.`,
        '0.40 0.46 0.54'
      );
      y -= 20;
    }
  }

  // ── Section 4 : Visa / Observation du contrôleur (optionnel) ──
  if (options.operatorNote.trim()) {
    y -= 6;
    const noteNum = options.includeStatsBreakdown ? '4' : '3';
    drawSectionTitle(`${noteNum}. Observations et visa du controleur`);
    const noteLines = wrapText(options.operatorNote.trim(), 92);
    const boxH = Math.max(36, noteLines.length * 11 + 16);
    ensureSpace(boxH + 10);
    pushRect(margin, y - boxH + 10, contentWidth, boxH, '0.98 0.98 0.99');
    pushStrokeRect(margin, y - boxH + 10, contentWidth, boxH, '0.84 0.87 0.91');
    noteLines.forEach((line, idx) => {
      pushText(margin + 10, y - idx * 11, 8.2, 'F1', line, '0.15 0.20 0.28');
    });
    y -= boxH + 8;
  }

  pagesContent.push(cmds.join('\n'));

  // Pieds de page numérotés sur toutes les pages
  const totalPages = pagesContent.length;
  for (let p = 0; p < totalPages; p++) {
    const footer = [
      `q 0.84 0.87 0.91 RG 0.5 w ${margin} 36 m ${(pageWidth - margin).toFixed(2)} 36 l S Q`,
      `BT /F1 7.2 Tf 0.45 0.50 0.58 rg ${margin} 24 Td (${toPdfWinAnsi(
        `VerifCCP Algerie Poste | Traitement 100 % local | Ref. ${report.id} | ${options.privacyMode ? 'Mode confidentialite actif' : 'Mode standard'}`
      )}) Tj ET`,
      `BT /F2 7.5 Tf 0.35 0.41 0.50 rg ${(pageWidth - margin - 52).toFixed(2)} 24 Td (Page ${p + 1} / ${totalPages}) Tj ET`,
    ].join('\n');
    pagesContent[p] = pagesContent[p] + '\n' + footer;
  }

  // Assemblage binaire PDF 1.4
  const objects: string[] = ['', ''];
  const addObj = (body: string) => {
    objects.push(body);
    return objects.length;
  };

  const fontRegular = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const fontBold = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const fontMono = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');

  const pageIds: number[] = [];
  for (const stream of pagesContent) {
    const contentId = addObj(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageId = addObj(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}] /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R /F3 ${fontMono} 0 R >> >> /Contents ${contentId} 0 R >>`
    );
    pageIds.push(pageId);
  }

  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets: number[] = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

  const outBytes = new Uint8Array(new ArrayBuffer(pdf.length));
  for (let i = 0; i < pdf.length; i++) {
    outBytes[i] = pdf.charCodeAt(i) & 0xff;
  }

  const blob = new Blob([outBytes], { type: 'application/pdf' });
  const dateStamp = new Date(report.analyzedAt).toISOString().slice(0, 10).replace(/-/g, '');
  const fileName = `rapport_conformite_ccp_${sanitizeBaseName(report.fileName)}_${dateStamp}.pdf`;

  return {
    blob,
    fileName,
    pageCount: totalPages,
    includedAnomaliesCount: anomalies.length,
    totalAnomaliesInScope: anomaliesSource.length,
    sizeBytes: blob.size,
  };
}

export function triggerPdfDownload(result: GeneratedPdfResult): void {
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
