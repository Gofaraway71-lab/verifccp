import {
  AnalysisReport,
  AnalysisSummary,
  AnomalyCategory,
  DecodedFileResult,
  FileStatus,
  FormatDetectionResult,
  SafeCorrectionChange,
  SafeCorrectionProposal,
  Severity,
  ValidationProfile,
} from '../types/ccp';
import { stripInvisibleChars } from './fileParser';
import { validateNonRipFile } from './nonRipValidator';
import { validateRibFile } from './ribValidator';
import { validateRipFile } from './ripValidator';

/**
 * Génère uniquement des corrections SÛRES (hygiène technique sans modification métier) :
 * - Suppression du BOM UTF-8
 * - Suppression des caractères invisibles / contrôle
 * - Suppression des lignes vides parasites
 * - Normalisation des fins de ligne (CRLF standard Windows / Algérie Poste)
 * Ne modifie JAMAIS automatiquement un numéro CCP, un RIP, une clé, un montant ou un nom.
 */
function buildSafeCorrectionProposal(
  decoded: DecodedFileResult,
  profile: ValidationProfile
): SafeCorrectionProposal {
  const targetLineEnding: 'CRLF' | 'LF' = profile.expectedLineEnding === 'LF' ? 'LF' : 'CRLF';
  const eol = targetLineEnding === 'CRLF' ? '\r\n' : '\n';

  const summary: string[] = [];
  const changes: SafeCorrectionChange[] = [];
  const cleanedLines: string[] = [];
  let removedEmptyCount = 0;
  let cleanedInvisibleLines = 0;

  if (decoded.hasBom) {
    summary.push('Suppression du marqueur BOM UTF-8 en début de fichier.');
  }

  for (let i = 0; i < decoded.rawLines.length; i++) {
    const lineNum = i + 1;
    const orig = decoded.rawLines[i];

    if (orig.trim().length === 0) {
      removedEmptyCount++;
      changes.push({
        lineNumber: lineNum,
        reason: 'Suppression d’une ligne vide parasite',
        original: orig,
        corrected: '(ligne supprimée)',
      });
      continue;
    }

    let cleaned = stripInvisibleChars(orig);
    // Pour les formats délimités uniquement, suppression d'espaces superflus autour des cellules
    // Pour la largeur fixe 62 car., on préserve strictement tous les espaces significatifs!
    if (profile.structure !== 'fixed-62') {
      const trimmed = cleaned.trim();
      if (trimmed !== cleaned) {
        cleaned = trimmed;
      }
    }

    if (cleaned !== orig) {
      cleanedInvisibleLines++;
      changes.push({
        lineNumber: lineNum,
        reason: 'Suppression de caractère(s) invisible(s) ou espace(s) technique(s)',
        original: orig,
        corrected: cleaned,
      });
    }

    cleanedLines.push(cleaned);
  }

  if (removedEmptyCount > 0) {
    summary.push(`Suppression de ${removedEmptyCount} ligne(s) vide(s).`);
  }
  if (cleanedInvisibleLines > 0) {
    summary.push(`Nettoyage des caractères invisibles sur ${cleanedInvisibleLines} ligne(s).`);
  }
  if (decoded.lineEnding === 'MIXED' || (decoded.lineEnding !== 'NONE' && decoded.lineEnding !== targetLineEnding)) {
    summary.push(`Normalisation des fins de ligne vers ${targetLineEnding}.`);
  }

  const correctedContent = cleanedLines.join(eol);
  const hasChanges =
    summary.length > 0 || (decoded.rawText !== correctedContent && decoded.rawLines.length > 0);

  return {
    hasChanges,
    summary,
    correctedContent,
    changes,
    targetLineEnding,
  };
}

/**
 * Orchestrateur principal d'analyse : route strictement vers le moteur RIP ou non-RIP
 * selon le profil sélectionné, calcule les statistiques globales et construit le rapport.
 */
export async function analyzeDecodedFile(
  decoded: DecodedFileResult,
  detection: FormatDetectionResult,
  profile: ValidationProfile,
  options?: {
    onProgress?: (processed: number, total: number) => void;
    signal?: AbortSignal;
  }
): Promise<AnalysisReport> {
  const start = performance.now();

  const effectiveProfile: ValidationProfile =
    profile.isBuiltIn && (profile.structure === 'delimited' || profile.structure === 'spreadsheet')
      ? {
          ...profile,
          structure:
            detection.detectedStructure === 'spreadsheet'
              ? 'spreadsheet'
              : detection.detectedStructure === 'delimited'
                ? 'delimited'
                : profile.structure,
          delimiter: detection.delimiter ?? profile.delimiter,
          hasHeaderRow: detection.hasHeader,
        }
      : profile;

  const engineResult =
    effectiveProfile.formatKind === 'rip'
      ? await validateRipFile(decoded, effectiveProfile, options?.onProgress, options?.signal)
      : effectiveProfile.formatKind === 'rib'
        ? await validateRibFile(decoded, effectiveProfile, options?.onProgress, options?.signal)
        : await validateNonRipFile(decoded, effectiveProfile, options?.onProgress, options?.signal);

  const countsBySeverity: Record<Severity, number> = {
    critical: 0,
    error: 0,
    warning: 0,
    info: 0,
  };
  const countsByCategory: Record<AnomalyCategory, number> = {
    structure: 0,
    rip: 0,
    'non-rip': 0,
    key: 0,
    amount: 0,
    coherence: 0,
    duplicate: 0,
    field: 0,
    encoding: 0,
  };

  for (const a of engineResult.anomalies) {
    countsBySeverity[a.severity]++;
    countsByCategory[a.category]++;
  }

  const detailRecords = engineResult.records.filter((r) => r.kind === 'detail' || r.kind === 'malformed');
  const headerRecords = engineResult.records.filter((r) => r.kind === 'header');
  const emptyRecords = engineResult.records.filter((r) => r.kind === 'empty');
  const nonEmptyRecords = engineResult.records.filter((r) => r.kind !== 'empty');

  const validRecords = nonEmptyRecords.filter((r) => !r.hasCriticalOrError).length;
  const invalidRecords = nonEmptyRecords.filter((r) => r.hasCriticalOrError).length;
  const warningRecords = nonEmptyRecords.filter((r) => !r.hasCriticalOrError && r.hasWarning).length;

  let status: FileStatus = 'conforme';
  if (countsBySeverity.critical > 0 || countsBySeverity.error > 0) {
    status = 'non-conforme';
  } else if (countsBySeverity.warning > 0) {
    status = 'a-verifier';
  }

  const summary: AnalysisSummary = {
    totalLines: decoded.rawLines.length,
    nonEmptyLines: nonEmptyRecords.length,
    emptyLines: emptyRecords.length,
    headerCount: headerRecords.length,
    beneficiaryCount: detailRecords.length,
    validRecords,
    invalidRecords,
    warningRecords,
    duplicateAccounts: engineResult.duplicateAccounts,
    repeatedLines: engineResult.repeatedLines,
    declaredTotalCentimes: engineResult.declaredTotalCentimes,
    computedTotalCentimes: engineResult.computedTotalCentimes,
    declaredBeneficiaryCount: engineResult.declaredBeneficiaryCount,
    headerPeriod: engineResult.headerPeriod,
    ordonnateurAccount: engineResult.ordonnateurAccount,
    countsBySeverity,
    countsByCategory,
  };

  const profileMismatchWarning =
    (detection.detectedFormat !== 'unknown' &&
      detection.detectedFormat !== 'ambiguous' &&
      detection.detectedFormat !== profile.formatKind) ||
    detection.detectedFormat === 'ambiguous';

  const safeCorrection = buildSafeCorrectionProposal(decoded, effectiveProfile);
  const durationMs = Math.max(1, Math.round(performance.now() - start));

  return {
    id: `RPT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    analyzedAt: new Date().toISOString(),
    durationMs,
    fileName: decoded.fileName,
    fileSize: decoded.fileSize,
    profileId: effectiveProfile.id,
    profileName: effectiveProfile.name,
    profileFormat: effectiveProfile.formatKind,
    structure: effectiveProfile.structure,
    status,
    detection,
    decoded: {
      detectedEncoding: decoded.detectedEncoding,
      hasBom: decoded.hasBom,
      hasReplacementChars: decoded.hasReplacementChars,
      invisibleCharCount: decoded.invisibleCharCount,
      lineEnding: decoded.lineEnding,
    },
    summary,
    records: engineResult.records,
    anomalies: engineResult.anomalies,
    safeCorrection,
    originalRawText: decoded.rawText,
    profileMismatchWarning,
  };
}
