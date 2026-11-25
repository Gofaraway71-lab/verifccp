import { jsPDF } from 'jspdf';
import { AnalysisReport, Anomaly, Severity } from '../types/ccp';
import { formatDZD, formatFileSize, maskAccountNumber, maskSensitiveInText } from './cryptoKeys';

export interface SimplePdfOptions {
  privacyMode: boolean;
  /** Si fourni, exporte ce sous-ensemble (ex. filtre actif) au lieu de toutes les anomalies */
  anomalies?: Anomaly[];
  filterLabel?: string;
}

export interface SimplePdfExportResult {
  fileName: string;
  pageCount: number;
  anomalyCount: number;
}

const STATUS_META: Record<
  AnalysisReport['status'],
  { label: string; textRgb: [number, number, number]; bgRgb: [number, number, number] }
> = {
  conforme: {
    label: 'CONFORME - PRET POUR TRANSMISSION',
    textRgb: [21, 128, 61],
    bgRgb: [236, 253, 245],
  },
  'a-verifier': {
    label: 'A VERIFIER - AVERTISSEMENTS DETECTES',
    textRgb: [180, 83, 9],
    bgRgb: [255, 251, 235],
  },
  'non-conforme': {
    label: 'NON CONFORME - CORRECTIONS REQUISES',
    textRgb: [185, 28, 28],
    bgRgb: [254, 242, 242],
  },
};

const SEVERITY_META: Record<Severity, { label: string; rgb: [number, number, number] }> = {
  critical: { label: 'Critique', rgb: [185, 28, 28] },
  error: { label: 'Erreur', rgb: [220, 38, 38] },
  warning: { label: 'Avert.', rgb: [180, 83, 9] },
  info: { label: 'Info', rgb: [3, 105, 161] },
};

/**
 * Normalise les caractères Unicode spéciaux non supportés nativement par les polices
 * standard Helvetica/Courier de jsPDF (WinAnsi) tout en préservant les accents français.
 */
function sanitizePdfText(input: string): string {
  return input
    .replace(/\u202F|\u00A0/g, ' ')
    .replace(/[«»]/g, '"')
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/•/g, '*')
    .replace(/→/g, '->')
    .replace(/×/g, 'x')
    .replace(/∅/g, '(vide)')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
}

function safeFileBaseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '_');
}

/**
 * Génère et télécharge un rapport PDF simple (résumé de conformité + liste des anomalies)
 * via la bibliothèque légère jsPDF, 100 % côté client sans aucune transmission réseau.
 */
export function generateSimpleCompliancePdf(
  report: AnalysisReport,
  options: SimplePdfOptions
): SimplePdfExportResult {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210 mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297 mm
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const bottomLimit = pageHeight - 18;

  const anomaliesList = options.anomalies ?? report.anomalies;
  const isFiltered = Boolean(options.anomalies && options.anomalies.length !== report.anomalies.length);
  const maxRows = 1200;
  const rowsToPrint = anomaliesList.slice(0, maxRows);

  let y = 0;

  const drawPageHeader = () => {
    doc.setFillColor(15, 41, 66); // #0F2942
    doc.rect(0, 0, pageWidth, 22, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.text(sanitizePdfText('VérifCCP — Rapport simple de conformité CCP'), margin, 9.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(203, 213, 225);
    const metaLine = [
      `Fichier : ${report.fileName}`,
      `Format : ${report.profileFormat === 'rip' ? 'RIP (00799999)' : report.profileFormat === 'rib' ? 'RIB Bancaire (Mod 97)' : 'non-RIP (00000000)'}`,
      `Date : ${new Date(report.analyzedAt).toLocaleString('fr-FR')}`,
    ].join('  |  ');
    doc.text(sanitizePdfText(metaLine).slice(0, 115), margin, 16.5);

    y = 28;
  };

  const ensureSpace = (neededMm: number): boolean => {
    if (y + neededMm > bottomLimit) {
      doc.addPage();
      drawPageHeader();
      return true;
    }
    return false;
  };

  drawPageHeader();

  // ── 1. Bandeau de statut global ──
  const statusInfo = STATUS_META[report.status];
  doc.setFillColor(...statusInfo.bgRgb);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.rect(margin, y, contentWidth, 14, 'FD');

  doc.setFillColor(...statusInfo.textRgb);
  doc.rect(margin, y, 2, 14, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('STATUT GLOBAL DE CONFORMITE', margin + 5, y + 5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...statusInfo.textRgb);
  doc.text(sanitizePdfText(statusInfo.label), margin + 5, y + 10.8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    sanitizePdfText(`Réf. ${report.id}  |  ${options.privacyMode ? 'Comptes masqués' : 'Affichage complet'}`),
    pageWidth - margin - 3,
    y + 8.5,
    { align: 'right' }
  );

  y += 20;

  // ── 2. Résumé de conformité ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 41, 66);
  doc.text('1. Résumé de conformité', margin, y);
  y += 2.2;
  doc.setDrawColor(15, 41, 66);
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  const complianceRate =
    report.summary.nonEmptyLines > 0
      ? ((report.summary.validRecords / report.summary.nonEmptyLines) * 100).toFixed(1)
      : '0.0';

  const summaryRows: Array<[string, string, string, string]> = [
    [
      'Fichier & taille',
      `${report.fileName} (${formatFileSize(report.fileSize)})`,
      'Taux de conformité',
      `${complianceRate} % (${report.summary.validRecords}/${report.summary.nonEmptyLines})`,
    ],
    [
      'Profil appliqué',
      report.profileName,
      'Bénéficiaires',
      `${report.summary.beneficiaryCount}${report.summary.declaredBeneficiaryCount !== null ? ` / ${report.summary.declaredBeneficiaryCount} déclaré(s)` : ''}`,
    ],
    [
      'Ordonnateur (L1)',
      report.summary.ordonnateurAccount
        ? maskAccountNumber(report.summary.ordonnateurAccount, options.privacyMode)
        : 'Non applicable',
      'Montant calculé',
      formatDZD(report.summary.computedTotalCentimes),
    ],
    [
      'Période / Encodage',
      `${report.summary.headerPeriod ?? 'N/A'} · ${report.decoded.detectedEncoding} (${report.decoded.lineEnding})`,
      'Montant déclaré (L1)',
      report.summary.declaredTotalCentimes !== null
        ? formatDZD(report.summary.declaredTotalCentimes)
        : 'Non applicable',
    ],
    [
      'Lignes invalides',
      `${report.summary.invalidRecords} (doublons : ${report.summary.duplicateAccounts}, répétées : ${report.summary.repeatedLines})`,
      'Anomalies (Total)',
      `${report.anomalies.length} (${report.summary.countsBySeverity.critical} crit., ${report.summary.countsBySeverity.error} err., ${report.summary.countsBySeverity.warning} av.)`,
    ],
  ];

  const colW1 = 31;
  const colW2 = 60;
  const colW3 = 33;
  const colW4 = contentWidth - colW1 - colW2 - colW3;

  doc.setLineWidth(0.2);
  doc.setDrawColor(226, 232, 240);

  for (let i = 0; i < summaryRows.length; i++) {
    const [k1, v1, k2, v2] = summaryRows[i];
    const rowH = 6.8;
    if (i % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, contentWidth, rowH, 'F');
    }
    doc.rect(margin, y, contentWidth, rowH, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(sanitizePdfText(k1), margin + 2, y + 4.5);
    doc.text(sanitizePdfText(k2), margin + colW1 + colW2 + 2, y + 4.5);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(sanitizePdfText(v1).slice(0, 38), margin + colW1 + 1, y + 4.5);
    doc.text(sanitizePdfText(v2).slice(0, 36), margin + colW1 + colW2 + colW3 + 1, y + 4.5);

    y += rowH;
  }

  y += 8;

  // ── 3. Liste des anomalies ──
  const scopeDesc = isFiltered
    ? `${anomaliesList.length} filtrée(s) sur ${report.anomalies.length}${options.filterLabel ? ` — ${options.filterLabel}` : ''}`
    : `${report.anomalies.length} détectée(s)`;

  ensureSpace(16);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 41, 66);
  doc.text(sanitizePdfText(`2. Liste des anomalies (${scopeDesc})`), margin, y);
  y += 2.2;
  doc.setDrawColor(15, 41, 66);
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageWidth - margin, y);
  y += 4.5;

  if (rowsToPrint.length === 0) {
    doc.setFillColor(236, 253, 245);
    doc.setDrawColor(167, 243, 208);
    doc.rect(margin, y, contentWidth, 9, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(21, 128, 61);
    doc.text(
      sanitizePdfText('Aucune anomalie dans le périmètre sélectionné. Contrôle conforme.'),
      margin + 3,
      y + 5.8
    );
    y += 12;
  } else {
    const xLine = margin;
    const xSev = margin + 13;
    const xField = margin + 39;
    const xDesc = margin + 82;
    const descWidth = pageWidth - margin - xDesc - 2;

    const drawTableHeader = () => {
      doc.setFillColor(15, 41, 66);
      doc.rect(margin, y, contentWidth, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(255, 255, 255);
      doc.text('Ligne', xLine + 1.5, y + 4.7);
      doc.text('Gravité / Code', xSev + 1, y + 4.7);
      doc.text('Champ / Compte', xField + 1, y + 4.7);
      doc.text('Valeur détectée & Description', xDesc + 1, y + 4.7);
      y += 7;
    };

    ensureSpace(18);
    drawTableHeader();

    for (let i = 0; i < rowsToPrint.length; i++) {
      const a = rowsToPrint[i];
      const detected = sanitizePdfText(maskSensitiveInText(a.detectedValue, options.privacyMode));
      const description = sanitizePdfText(maskSensitiveInText(a.description, options.privacyMode));
      const recordId = sanitizePdfText(maskAccountNumber(a.recordIdentifier, options.privacyMode));
      const suggestion = a.suggestion ? sanitizePdfText(`Suggestion : ${a.suggestion}`) : '';

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.3);
      const descLines: string[] = doc.splitTextToSize(`Détecté : ${detected} — ${description}`, descWidth);
      const suggLines: string[] = suggestion ? doc.splitTextToSize(suggestion, descWidth) : [];
      const totalLines = Math.max(2, descLines.length + suggLines.length);
      const rowH = totalLines * 3.4 + 3.4;

      if (ensureSpace(rowH + 2)) {
        drawTableHeader();
      }

      if (i % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, contentWidth, rowH, 'F');
      }

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.15);
      doc.line(margin, y + rowH, pageWidth - margin, y + rowH);

      // Ligne
      doc.setFont('courier', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      doc.text(a.lineNumber === 0 ? 'GLOB' : String(a.lineNumber), xLine + 1.5, y + 4.2);

      // Gravité + Code
      const sev = SEVERITY_META[a.severity];
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.3);
      doc.setTextColor(...sev.rgb);
      doc.text(sanitizePdfText(sev.label), xSev + 1, y + 4.2);

      doc.setFont('courier', 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(100, 116, 139);
      doc.text(sanitizePdfText(a.ruleCode), xSev + 1, y + 7.6);

      // Champ + Identifiant
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.2);
      doc.setTextColor(30, 41, 59);
      doc.text(sanitizePdfText(a.field).slice(0, 24), xField + 1, y + 4.2);

      doc.setFont('courier', 'normal');
      doc.setFontSize(6.6);
      doc.setTextColor(100, 116, 139);
      doc.text(recordId.slice(0, 24), xField + 1, y + 7.6);

      // Description + Suggestion
      let ty = y + 4.2;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.3);
      doc.setTextColor(30, 41, 59);
      for (const line of descLines) {
        doc.text(line, xDesc + 1, ty);
        ty += 3.4;
      }
      if (suggLines.length > 0) {
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(6.9);
        for (const line of suggLines) {
          doc.text(line, xDesc + 1, ty);
          ty += 3.4;
        }
      }

      y += rowH;
    }

    if (anomaliesList.length > rowsToPrint.length) {
      ensureSpace(10);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(
        sanitizePdfText(
          `Note : ${anomaliesList.length - rowsToPrint.length} anomalie(s) supplémentaire(s) non affichée(s) (limite : ${maxRows}). Exportez en Excel ou CSV pour la liste complète.`
        ),
        margin,
        y + 5
      );
    }
  }

  // ── Pieds de page numérotés sur toutes les pages ──
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.25);
    doc.line(margin, pageHeight - 13, pageWidth - margin, pageHeight - 13);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(
      sanitizePdfText(
        `VérifCCP Algérie Poste | Rapport simple (jsPDF) | Traitement 100 % local | Réf. ${report.id}`
      ),
      margin,
      pageHeight - 8.5
    );
    doc.setFont('helvetica', 'bold');
    doc.text(`Page ${p} / ${pageCount}`, pageWidth - margin, pageHeight - 8.5, { align: 'right' });
  }

  const dateStamp = new Date(report.analyzedAt).toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = isFiltered ? '_filtre' : '';
  const fileName = `rapport_simple_ccp_${safeFileBaseName(report.fileName)}${suffix}_${dateStamp}.pdf`;

  doc.save(fileName);

  return {
    fileName,
    pageCount,
    anomalyCount: rowsToPrint.length,
  };
}
