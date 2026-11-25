import { DecodedFileResult, FormatDetectionResult } from '../types/ccp';
import { parseDelimitedLine } from './fileParser';

const DELIMITERS: Array<';' | ',' | '\t' | '|'> = [';', ',', '\t', '|'];

function isBankRibDigits(digits: string): boolean {
  if (!/^\d{20}$/.test(digits)) return false;
  if (digits.startsWith('00799999') || digits.startsWith('00000000')) return false;
  if (digits.slice(0, 3) === '000') return false;
  return true;
}

/**
 * Détecte automatiquement le format (RIP, non-RIP ou RIB bancaire), la structure
 * (largeur fixe 62 car. Algérie Poste / Banque, délimité CSV/TXT ou tableur XLSX),
 * le séparateur, la présence d'en-tête et le score de confiance.
 * Ne devine jamais silencieusement en cas d'ambiguïté : signale clairement les conflits.
 */
export function detectFileFormat(decoded: DecodedFileResult): FormatDetectionResult {
  const nonEmptyLines = decoded.rawLines.filter((l) => l.trim().length > 0);
  const lineCount = nonEmptyLines.length;
  const reasons: string[] = [];
  const warnings: string[] = [...decoded.parseWarnings];

  if (lineCount === 0) {
    return {
      detectedFormat: 'unknown',
      detectedStructure: 'unknown',
      suggestedProfileId: null,
      confidence: 0,
      hasHeader: false,
      lineCount: 0,
      ripPrefixCount: 0,
      nonRipPrefixCount: 0,
      ribPrefixCount: 0,
      otherPrefixCount: 0,
      reasons: ['Le fichier est vide ou ne contient aucune ligne exploitable.'],
      warnings: ['Impossible de détecter le format d’un fichier vide.'],
    };
  }

  // 1. Test de la structure Largeur Fixe 62 caractères (lignes commençant par '*' et ~62 caractères)
  const sample = nonEmptyLines.slice(0, 300);
  const starLines = sample.filter((l) => l.startsWith('*'));
  const exact62Lines = sample.filter((l) => l.length === 62);
  const near62Lines = sample.filter((l) => l.length >= 55 && l.length <= 70);
  const isFixedAlgPoste =
    !decoded.spreadsheetRows &&
    (starLines.length / sample.length >= 0.6 || exact62Lines.length / sample.length >= 0.6);

  if (isFixedAlgPoste) {
    let ripPrefixCount = 0;
    let nonRipPrefixCount = 0;
    let ribPrefixCount = 0;
    let otherPrefixCount = 0;

    let detailRipCount = 0;
    let detailNonRipCount = 0;
    let detailRibCount = 0;

    for (let i = 0; i < nonEmptyLines.length; i++) {
      const line = nonEmptyLines[i];
      const startIdx = line.startsWith('*') ? 1 : 0;
      const account20 = line.slice(startIdx, startIdx + 20);
      const prefix8 = account20.slice(0, 8);
      const isDetail = i > 0;

      if (prefix8 === '00799999') {
        ripPrefixCount++;
        if (isDetail) detailRipCount++;
      } else if (prefix8 === '00000000') {
        nonRipPrefixCount++;
        if (isDetail) detailNonRipCount++;
      } else if (isBankRibDigits(account20)) {
        ribPrefixCount++;
        if (isDetail) detailRibCount++;
      } else {
        otherPrefixCount++;
      }
    }

    const firstLine = nonEmptyLines[0];
    const hasHeader = firstLine.endsWith('0') && firstLine.length >= 47;
    reasons.push(
      `Structure largeur fixe détectée (${exact62Lines.length}/${sample.length} lignes exactement à 62 caractères, ${starLines.length}/${sample.length} préfixées par « * »).`
    );
    if (hasHeader) {
      reasons.push('Ligne 1 reconnue comme en-tête récapitulatif (code type « 0 » en fin de ligne).');
    }

    // Cas RIB Bancaire homogène (ou en-tête ordonnateur CCP/RIP avec détails exclusivement RIB bancaires)
    if (detailRibCount > 0 && detailRipCount === 0 && detailNonRipCount === 0) {
      const ratio = ribPrefixCount / lineCount;
      let confidence = Math.round(70 + ratio * 20 + (exact62Lines.length / sample.length) * 10);
      if (otherPrefixCount > 0) {
        confidence = Math.min(confidence, 84);
        warnings.push(`${otherPrefixCount} ligne(s) présentent un RIB incomplet ou mal formé.`);
      }
      reasons.push(`RIB bancaires algériens sur 20 chiffres identifiés sur ${ribPrefixCount}/${lineCount} ligne(s).`);
      if (hasHeader && (ripPrefixCount > 0 || nonRipPrefixCount > 0)) {
        reasons.push('En-tête ordonnateur CCP/RIP détecté en ligne 1 avec bénéficiaires bancaires.');
      }
      return {
        detectedFormat: 'rib',
        detectedStructure: 'fixed-62',
        suggestedProfileId: 'fixed-62-rib',
        confidence: Math.min(99, confidence),
        hasHeader,
        lineCount,
        ripPrefixCount,
        nonRipPrefixCount,
        ribPrefixCount,
        otherPrefixCount,
        reasons,
        warnings,
      };
    }

    // Cas mixte impliquant des lignes RIB bancaires et des lignes CCP/RIP en détail
    if (ribPrefixCount > 0 && (detailRipCount > 0 || detailNonRipCount > 0)) {
      warnings.push(
        `Fichier mixte : ${ribPrefixCount} RIB bancaire(s), ${ripPrefixCount} ligne(s) RIP (00799999) et ${nonRipPrefixCount} ligne(s) non-RIP (00000000). Le profil RIB bancaire peut contrôler les lignes mixtes.`
      );
      return {
        detectedFormat: 'ambiguous',
        detectedStructure: 'fixed-62',
        suggestedProfileId: 'fixed-62-rib',
        confidence: 58,
        hasHeader,
        lineCount,
        ripPrefixCount,
        nonRipPrefixCount,
        ribPrefixCount,
        otherPrefixCount,
        reasons,
        warnings,
      };
    }

    // Détection RIP vs non-RIP stricte
    if (ripPrefixCount > 0 && nonRipPrefixCount > 0) {
      warnings.push(
        `Conflit critique : le fichier mélange des lignes RIP (${ripPrefixCount} avec préfixe 00799999) et des lignes non-RIP (${nonRipPrefixCount} avec préfixe 00000000). Sélectionnez manuellement le profil attendu.`
      );
      const dominantRip = ripPrefixCount >= nonRipPrefixCount;
      return {
        detectedFormat: 'ambiguous',
        detectedStructure: 'fixed-62',
        suggestedProfileId: dominantRip ? 'ap-rip-fixed-62' : 'ap-nonrip-fixed-62',
        confidence: 45,
        hasHeader,
        lineCount,
        ripPrefixCount,
        nonRipPrefixCount,
        ribPrefixCount,
        otherPrefixCount,
        reasons,
        warnings,
      };
    }

    if (ripPrefixCount > 0) {
      const ratio = ripPrefixCount / lineCount;
      let confidence = Math.round(70 + ratio * 20 + (exact62Lines.length / sample.length) * 10);
      if (otherPrefixCount > 0) {
        confidence = Math.min(confidence, 82);
        warnings.push(`${otherPrefixCount} ligne(s) présentent un préfixe inhabituel différent de 00799999.`);
      }
      reasons.push(`Préfixe RIP « 00799999 » identifié sur ${ripPrefixCount}/${lineCount} ligne(s).`);
      return {
        detectedFormat: 'rip',
        detectedStructure: 'fixed-62',
        suggestedProfileId: 'ap-rip-fixed-62',
        confidence: Math.min(99, confidence),
        hasHeader,
        lineCount,
        ripPrefixCount,
        nonRipPrefixCount,
        ribPrefixCount,
        otherPrefixCount,
        reasons,
        warnings,
      };
    }

    if (nonRipPrefixCount > 0) {
      const ratio = nonRipPrefixCount / lineCount;
      let confidence = Math.round(70 + ratio * 20 + (exact62Lines.length / sample.length) * 10);
      if (otherPrefixCount > 0) {
        confidence = Math.min(confidence, 82);
        warnings.push(`${otherPrefixCount} ligne(s) présentent un préfixe différent de 00000000.`);
      }
      reasons.push(`Bourrage non-RIP « 00000000 » identifié sur ${nonRipPrefixCount}/${lineCount} ligne(s) (aucun préfixe RIP).`);
      return {
        detectedFormat: 'non-rip',
        detectedStructure: 'fixed-62',
        suggestedProfileId: 'ap-nonrip-fixed-62',
        confidence: Math.min(99, confidence),
        hasHeader,
        lineCount,
        ripPrefixCount,
        nonRipPrefixCount,
        ribPrefixCount,
        otherPrefixCount,
        reasons,
        warnings,
      };
    }

    // Lignes * / 62 car mais préfixes ni 00799999 ni 00000000 ni RIB valide 20 chiffres
    warnings.push(
      `Structure proche de 62 caractères (${near62Lines.length} lignes), mais aucun préfixe 00799999, 00000000 ou RIB 20 chiffres reconnu. Choix manuel du profil recommandé.`
    );
    return {
      detectedFormat: 'ambiguous',
      detectedStructure: 'fixed-62',
      suggestedProfileId: null,
      confidence: 35,
      hasHeader,
      lineCount,
      ripPrefixCount,
      nonRipPrefixCount,
      ribPrefixCount,
      otherPrefixCount,
      reasons,
      warnings,
    };
  }

  // 2. Fichier tableur XLSX ou texte délimité (CSV / TSV)
  let rows: string[][] = [];
  let chosenDelimiter: ';' | ',' | '\t' | '|' | undefined = undefined;
  const detectedStructure: 'delimited' | 'spreadsheet' = decoded.spreadsheetRows ? 'spreadsheet' : 'delimited';

  if (decoded.spreadsheetRows) {
    rows = decoded.spreadsheetRows.filter((r) => r.some((cell) => cell.trim().length > 0));
    reasons.push(`Classeur Excel lu directement (${rows.length} lignes non vides).`);
  } else {
    // Choisir le séparateur le plus régulier
    let bestScore = -1;
    for (const delim of DELIMITERS) {
      const counts = sample.map((l) => parseDelimitedLine(l, delim).length);
      const multiCol = counts.filter((c) => c >= 2);
      if (multiCol.length === 0) continue;
      const mode = [...counts].sort((a, b) => a - b)[Math.floor(counts.length / 2)];
      const consistency = counts.filter((c) => c === mode).length / counts.length;
      const score = mode >= 2 ? consistency * 100 + Math.min(mode, 10) : 0;
      if (score > bestScore) {
        bestScore = score;
        chosenDelimiter = delim;
      }
    }

    if (chosenDelimiter) {
      rows = nonEmptyLines.map((l) => parseDelimitedLine(l, chosenDelimiter!));
      const delimLabel = chosenDelimiter === '\t' ? 'Tabulation' : `« ${chosenDelimiter} »`;
      reasons.push(`Structure délimitée détectée avec le séparateur ${delimLabel}.`);
    } else {
      warnings.push(
        'Structure non reconnue : ni largeur fixe 62 caractères, ni séparateur tabulaire cohérent.'
      );
      return {
        detectedFormat: 'unknown',
        detectedStructure: 'unknown',
        suggestedProfileId: null,
        confidence: 15,
        hasHeader: false,
        lineCount,
        ripPrefixCount: 0,
        nonRipPrefixCount: 0,
        ribPrefixCount: 0,
        otherPrefixCount: lineCount,
        reasons,
        warnings,
      };
    }
  }

  const columnCount = rows[0]?.length ?? 0;
  const firstRowJoined = (rows[0] ?? []).join(' ').toLowerCase();
  const hasHeader =
    /(rip|rib|ccp|compte|banque|agence|guichet|montant|nom|prenom|prénom|beneficiaire|bénéficiaire|cle|clé)/i.test(
      firstRowJoined
    );
  if (hasHeader) {
    reasons.push(`Ligne d’en-tête textuelle détectée (${columnCount} colonnes).`);
  }

  const normalizedHeaders = hasHeader
    ? (rows[0] ?? []).map((c) =>
        c
          .trim()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
      )
    : [];
  const headerSuggestsRib = hasHeader && /\b(rib|banque|agence|guichet|iban)\b/.test(normalizedHeaders.join(' '));
  const explicitAccountCol = normalizedHeaders.findIndex((h) => /\b(rib|rip|ccp|compte|account|iban)\b/.test(h));
  const amountCols = new Set(
    normalizedHeaders
      .map((h, idx) => (/\b(montant|amount|salaire|net|somme|virement)\b/.test(h) ? idx : -1))
      .filter((idx) => idx >= 0)
  );

  const dataRows = (hasHeader ? rows.slice(1) : rows).filter((r) => r.some((c) => c.trim().length > 0));
  let ripPrefixCount = 0;
  let nonRipPrefixCount = 0;
  let ribPrefixCount = 0;
  let otherPrefixCount = 0;

  for (const r of dataRows) {
    const normCells = r.map((c) => c.replace(/[\s-]+/g, ''));
    const hasRipCell = normCells.some((c) => /^00799999\d{12}$/.test(c));
    const hasBankRibCell = normCells.some((c) => isBankRibDigits(c));
    const hasNonRip20Cell = normCells.some((c) => /^00000000\d{12}$/.test(c));

    let hasShortCcpCell = false;
    if (!hasRipCell && !hasBankRibCell && !hasNonRip20Cell && !headerSuggestsRib) {
      const candidateCols = explicitAccountCol >= 0 ? [explicitAccountCol] : [0];
      hasShortCcpCell = candidateCols.some((idx) => {
        if (amountCols.has(idx)) return false;
        const val = normCells[idx] ?? '';
        return /^\d{4,10}$/.test(val);
      });
    }

    if (hasBankRibCell) {
      ribPrefixCount++;
    } else if (hasRipCell) {
      ripPrefixCount++;
    } else if (hasNonRip20Cell || hasShortCcpCell) {
      nonRipPrefixCount++;
    } else {
      otherPrefixCount++;
    }
  }

  if (ribPrefixCount > 0 && ripPrefixCount === 0 && nonRipPrefixCount === 0) {
    reasons.push(
      `Identifiants RIB bancaires 20 chiffres repérés sur ${ribPrefixCount}/${dataRows.length} ligne(s).`
    );
    return {
      detectedFormat: 'rib',
      detectedStructure,
      suggestedProfileId: 'csv-rib-standard',
      confidence: Math.min(94, Math.round(68 + (ribPrefixCount / Math.max(1, dataRows.length)) * 26)),
      delimiter: chosenDelimiter,
      columnCount,
      hasHeader,
      lineCount,
      ripPrefixCount,
      nonRipPrefixCount,
      ribPrefixCount,
      otherPrefixCount,
      reasons,
      warnings,
    };
  }

  if (ripPrefixCount > 0 && nonRipPrefixCount === 0 && ribPrefixCount === 0) {
    reasons.push(`Identifiants RIP 20 chiffres (00799999...) repérés sur ${ripPrefixCount}/${dataRows.length} ligne(s).`);
    return {
      detectedFormat: 'rip',
      detectedStructure,
      suggestedProfileId: 'csv-rip-standard',
      confidence: Math.min(92, Math.round(65 + (ripPrefixCount / Math.max(1, dataRows.length)) * 25)),
      delimiter: chosenDelimiter,
      columnCount,
      hasHeader,
      lineCount,
      ripPrefixCount,
      nonRipPrefixCount,
      ribPrefixCount,
      otherPrefixCount,
      reasons,
      warnings,
    };
  }

  if (nonRipPrefixCount > 0 && ripPrefixCount === 0 && ribPrefixCount === 0) {
    reasons.push(`Numéros de compte CCP sans préfixe RIP repérés sur ${nonRipPrefixCount}/${dataRows.length} ligne(s).`);
    return {
      detectedFormat: 'non-rip',
      detectedStructure,
      suggestedProfileId: 'csv-nonrip-standard',
      confidence: Math.min(88, Math.round(60 + (nonRipPrefixCount / Math.max(1, dataRows.length)) * 25)),
      delimiter: chosenDelimiter,
      columnCount,
      hasHeader,
      lineCount,
      ripPrefixCount,
      nonRipPrefixCount,
      ribPrefixCount,
      otherPrefixCount,
      reasons,
      warnings,
    };
  }

  const suggestedFallback =
    ribPrefixCount > 0 || headerSuggestsRib
      ? 'csv-rib-standard'
      : ripPrefixCount >= nonRipPrefixCount
        ? 'csv-rip-standard'
        : 'csv-nonrip-standard';

  warnings.push(
    'Détection incertaine ou format mixte sur ce fichier tabulaire. Vérifiez le profil et le mappage des colonnes.'
  );
  return {
    detectedFormat: 'ambiguous',
    detectedStructure,
    suggestedProfileId: suggestedFallback,
    confidence: ribPrefixCount > 0 ? 55 : 42,
    delimiter: chosenDelimiter,
    columnCount,
    hasHeader,
    lineCount,
    ripPrefixCount,
    nonRipPrefixCount,
    ribPrefixCount,
    otherPrefixCount,
    reasons,
    warnings,
  };
}

