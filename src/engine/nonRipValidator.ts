import {
  Anomaly,
  DecodedFileResult,
  ParsedRecord,
  RuleConfig,
  ValidationProfile,
} from '../types/ccp';
import { formatDZD, verifyAccountKey } from './cryptoKeys';
import { parseDelimitedLine } from './fileParser';
import { ValidationEngineOutput } from './ripValidator';

function getRule(profile: ValidationProfile, id: string): RuleConfig | undefined {
  return profile.rules.find((r) => r.id === id && r.enabled);
}

function isNameValid(name: string, allowArabic: boolean, allowAccented: boolean): { ok: boolean; badChars: string[] } {
  const allowedPattern = allowArabic
    ? allowAccented
      ? /^[A-Za-zÀ-ÖØ-öø-ÿ\u0600-\u06FF\s'\-.]+$/
      : /^[A-Za-z\u0600-\u06FF\s'\-.]+$/
    : allowAccented
      ? /^[A-Za-zÀ-ÖØ-öø-ÿ\s'\-.]+$/
      : /^[A-Za-z\s'\-.]+$/;

  if (allowedPattern.test(name)) return { ok: true, badChars: [] };
  const badSet = new Set<string>();
  for (const ch of name) {
    if (!allowedPattern.test(ch)) {
      badSet.add(ch === '\t' ? '\\t' : ch);
    }
  }
  return { ok: false, badChars: Array.from(badSet).slice(0, 6) };
}

/**
 * Moteur de validation dédié EXCLUSIVEMENT au format non-RIP (Algérie Poste).
 * Strictement séparé du moteur RIP : rejette explicitement le préfixe RIP 00799999
 * et applique les règles spécifiques aux comptes CCP non-RIP.
 */
export async function validateNonRipFile(
  decoded: DecodedFileResult,
  profile: ValidationProfile,
  onProgress?: (processed: number, total: number) => void,
  signal?: AbortSignal
): Promise<ValidationEngineOutput> {
  const anomalies: Anomaly[] = [];
  const records: ParsedRecord[] = [];
  let anomalySeq = 1;

  const pushAnomaly = (
    rule: RuleConfig,
    lineNumber: number,
    recordIdentifier: string,
    field: string,
    detectedValue: string,
    expectedRule: string,
    description: string,
    suggestion?: string,
    record?: ParsedRecord
  ) => {
    const id = `NRIP-ANM-${String(anomalySeq++).padStart(4, '0')}`;
    const item: Anomaly = {
      id,
      ruleId: rule.id,
      ruleCode: rule.code,
      lineNumber,
      recordIdentifier,
      field,
      detectedValue,
      expectedRule,
      description,
      severity: rule.severity,
      category: rule.category,
      formatScope: 'non-rip',
      suggestion,
    };
    anomalies.push(item);
    if (record) {
      record.anomalyIds.push(id);
      if (rule.severity === 'critical' || rule.severity === 'error') {
        record.hasCriticalOrError = true;
        record.isValid = false;
      } else if (rule.severity === 'warning') {
        record.hasWarning = true;
      }
    }
  };

  // Contrôles d'encodage globaux
  const encRule = getRule(profile, 'nonrip-encoding-hygiene');
  if (encRule) {
    if (decoded.hasReplacementChars) {
      pushAnomaly(
        encRule,
        0,
        'Fichier',
        'Encodage',
        decoded.detectedEncoding,
        'Encodage valide sans caractère corrompu (U+FFFD)',
        'Des caractères mal décodés () ont été repérés dans le fichier non-RIP.',
        'Ré-encodez le fichier en UTF-8 ou sélectionnez Windows-1252 / Windows-1256.'
      );
    }
    if (decoded.hasBom) {
      pushAnomaly(
        encRule,
        1,
        'Fichier',
        'BOM UTF-8',
        'EF BB BF présent',
        'Aucun BOM en début de fichier',
        'Un BOM UTF-8 en tête de fichier risque de décaler la position 1 (*).',
        'Appliquez la correction sûre pour supprimer le BOM.'
      );
    }
    if (decoded.invisibleCharCount > 0) {
      pushAnomaly(
        encRule,
        0,
        'Fichier',
        'Caractères invisibles',
        `${decoded.invisibleCharCount} occurrence(s)`,
        'Aucun caractère invisible',
        `${decoded.invisibleCharCount} caractère(s) invisible(s) détecté(s).`,
        'Utilisez la correction sûre pour nettoyer les caractères invisibles.'
      );
    }
    if (decoded.lineEnding === 'MIXED') {
      pushAnomaly(
        encRule,
        0,
        'Fichier',
        'Fins de ligne',
        'Mixte (CRLF + LF)',
        `Homogène (${profile.expectedLineEnding === 'ANY' ? 'CRLF ou LF' : profile.expectedLineEnding})`,
        'Le fichier combine des fins de ligne Windows (CRLF) et Linux (LF).',
        'Utilisez la correction sûre pour normaliser les fins de ligne.'
      );
    }
  }

  const totalLines = decoded.rawLines.length;
  const notEmptyRule = getRule(profile, 'nonrip-file-not-empty');

  if (totalLines === 0 || decoded.rawLines.every((l) => l.trim().length === 0)) {
    if (notEmptyRule) {
      pushAnomaly(
        notEmptyRule,
        0,
        'Fichier',
        'Contenu',
        '0 ligne exploitable',
        'Au moins 1 ligne d’en-tête et 1 ligne bénéficiaire',
        'Le fichier non-RIP importé est vide.',
        'Importez un fichier CCP non-RIP contenant les données à vérifier.'
      );
    }
    return {
      records: [],
      anomalies,
      declaredTotalCentimes: null,
      computedTotalCentimes: 0,
      declaredBeneficiaryCount: null,
      headerPeriod: null,
      ordonnateurAccount: null,
      duplicateAccounts: 0,
      repeatedLines: 0,
    };
  }

  // BRANCHE A : Format Largeur Fixe 62 caractères Algérie Poste (non-RIP)
  if (profile.structure === 'fixed-62') {
    let declaredTotalCentimes: number | null = null;
    let declaredBeneficiaryCount: number | null = null;
    let computedTotalCentimes = 0;
    let headerPeriod: string | null = null;
    let ordonnateurAccount: string | null = null;
    let detailLineCount = 0;
    let duplicateAccounts = 0;
    let repeatedLines = 0;

    const seenAccountMap = new Map<string, number>();
    const seenExactLineMap = new Map<string, number>();

    const rEmptyLine = getRule(profile, 'nonrip-empty-lines');
    const rLen = getRule(profile, 'nonrip-line-length');
    const rStar = getRule(profile, 'nonrip-star-prefix');
    const rType = getRule(profile, 'nonrip-type-code');
    const rPrefix = getRule(profile, 'nonrip-prefix-00000000');
    const rDigits = getRule(profile, 'nonrip-digits-only');
    const rNonZero = getRule(profile, 'nonrip-nonzero-account');
    const rKey = getRule(profile, 'nonrip-key-check');
    const rHeaderKey = getRule(profile, 'nonrip-header-key-check');
    const rAmount = getRule(profile, 'nonrip-amount-format');
    const rHeaderPeriod = getRule(profile, 'nonrip-header-period');
    const rName = getRule(profile, 'nonrip-beneficiary-name');
    const rDup = getRule(profile, 'nonrip-duplicates');
    const rOrdInDet = getRule(profile, 'nonrip-ordonnateur-in-details');

    for (let idx = 0; idx < totalLines; idx++) {
      if (signal?.aborted) {
        throw new DOMException('Analyse annulée par l’utilisateur.', 'AbortError');
      }
      if (idx > 0 && idx % 500 === 0) {
        onProgress?.(idx, totalLines);
        await new Promise((res) => setTimeout(res, 0));
      }

      const lineNumber = idx + 1;
      const rawLine = decoded.rawLines[idx];

      if (rawLine.trim().length === 0) {
        const rec: ParsedRecord = {
          lineNumber,
          rawLine,
          lineLength: rawLine.length,
          kind: 'empty',
          isValid: !rEmptyLine || (rEmptyLine.severity !== 'critical' && rEmptyLine.severity !== 'error'),
          hasCriticalOrError: false,
          hasWarning: false,
          anomalyIds: [],
        };
        if (rEmptyLine) {
          pushAnomaly(
            rEmptyLine,
            lineNumber,
            `Ligne ${lineNumber}`,
            'Ligne complète',
            '(ligne vide)',
            'Enregistrement non-RIP de 62 caractères',
            'Ligne vide détectée dans le fichier non-RIP.',
            'Supprimez cette ligne vide.',
            rec
          );
        }
        records.push(rec);
        continue;
      }

      const isFirstLine = lineNumber === 1;
      const prefixChar = rawLine.slice(0, 1);
      const accountFull20 = rawLine.slice(1, 21);
      const accountPrefix8 = accountFull20.slice(0, 8);
      const ccp10 = accountFull20.slice(8, 18);
      const key2 = accountFull20.slice(18, 20);
      const amountRaw = rawLine.slice(21, 34);
      const typeCode = rawLine.length >= 62 ? rawLine.slice(61, 62) : rawLine.slice(-1);

      const rec: ParsedRecord = {
        lineNumber,
        rawLine,
        lineLength: rawLine.length,
        kind: isFirstLine ? 'header' : 'detail',
        prefixChar,
        accountFull20,
        accountPrefix8,
        ccp10,
        key2,
        amountRaw,
        typeCode,
        isValid: true,
        hasCriticalOrError: false,
        hasWarning: false,
        anomalyIds: [],
      };

      const recordId = accountFull20.trim() || `Ligne ${lineNumber}`;

      // 1. Longueur fixe 62 caractères
      if (rLen && rawLine.length !== profile.fixedLineLength) {
        rec.kind = isFirstLine ? 'header' : rawLine.length < 34 ? 'malformed' : 'detail';
        pushAnomaly(
          rLen,
          lineNumber,
          recordId,
          'Longueur ligne',
          `${rawLine.length} caractère(s)`,
          `Exactement ${profile.fixedLineLength} caractères`,
          `Longueur non conforme : ${rawLine.length} caractères au lieu de ${profile.fixedLineLength}.`,
          rawLine.length < profile.fixedLineLength
            ? 'Vérifiez le bourrage d’espaces sur le nom (27 car.) ou l’en-tête (14 espaces).'
            : 'Supprimez les caractères en trop en fin de ligne.',
          rec
        );
      }

      // 2. Préfixe '*'
      if (rStar && prefixChar !== profile.linePrefixChar) {
        pushAnomaly(
          rStar,
          lineNumber,
          recordId,
          'Préfixe ligne (Pos. 1)',
          prefixChar || '(vide)',
          `Caractère « ${profile.linePrefixChar} »`,
          `La ligne doit commencer par « ${profile.linePrefixChar} ».`,
          `Rétablissez le préfixe « ${profile.linePrefixChar} » en position 1.`,
          rec
        );
      }

      // 3. Code type en position 62
      const expectedType = isFirstLine ? profile.headerTypeCode : profile.detailTypeCode;
      if (rType && rawLine.length >= profile.fixedLineLength && typeCode !== expectedType) {
        pushAnomaly(
          rType,
          lineNumber,
          recordId,
          'Type ligne (Pos. 62)',
          typeCode,
          isFirstLine ? `« ${profile.headerTypeCode} » (En-tête)` : `« ${profile.detailTypeCode} » (Bénéficiaire)`,
          `Code type incorrect en position 62 (« ${typeCode} » au lieu de « ${expectedType} »).`,
          `Corrigez le code type en « ${expectedType} ».`,
          rec
        );
      }

      // 4. Compte CCP sur 20 chiffres
      const isAccountDigits = /^\d{20}$/.test(accountFull20);
      if (rDigits && !isAccountDigits) {
        pushAnomaly(
          rDigits,
          lineNumber,
          recordId,
          'Compte CCP (Pos. 2–21)',
          accountFull20,
          '20 chiffres stricts (0–9)',
          `Le champ compte CCP contient des caractères non numériques ou est tronqué (« ${accountFull20} »).`,
          'Assurez-vous que les positions 2 à 21 contiennent 20 chiffres stricts.',
          rec
        );
      }

      // 5. Préfixe non-RIP 00000000 obligatoire et REJET explicite du préfixe RIP 00799999
      if (rPrefix) {
        if (accountPrefix8 === profile.forbiddenAccountPrefix) {
          pushAnomaly(
            rPrefix,
            lineNumber,
            recordId,
            'Préfixe non-RIP (Pos. 2–9)',
            accountPrefix8,
            `Bourrage non-RIP « ${profile.accountPrefixExpected} »`,
            `Préfixe RIP (« ${accountPrefix8} ») détecté dans un fichier contrôlé en mode non-RIP : confusion de format détectée.`,
            'Sélectionnez le profil « Format RIP » ou vérifiez la nature exacte de ce fichier.',
            rec
          );
        } else if (accountPrefix8 !== profile.accountPrefixExpected) {
          pushAnomaly(
            rPrefix,
            lineNumber,
            recordId,
            'Préfixe non-RIP (Pos. 2–9)',
            accountPrefix8,
            `Bourrage non-RIP « ${profile.accountPrefixExpected} »`,
            `Les 8 premiers chiffres du bloc compte (« ${accountPrefix8} ») ne correspondent pas au bourrage non-RIP « ${profile.accountPrefixExpected} ».`,
            `Dans le format non-RIP sur 20 chiffres, les positions 2 à 9 doivent contenir « ${profile.accountPrefixExpected} ».`,
            rec
          );
        }
      }

      // 6. Numéro de compte non nul
      if (rNonZero && isAccountDigits && /^0{10}$/.test(ccp10)) {
        pushAnomaly(
          rNonZero,
          lineNumber,
          recordId,
          'Compte CCP (Pos. 10–19)',
          ccp10,
          'Numéro de compte CCP > 0',
          'Le numéro de compte CCP est composé uniquement de zéros.',
          'Saisissez un numéro de compte CCP valide.',
          rec
        );
      }

      // 7. Contrôle mathématique de la clé (pos 20–21) selon l'algorithme configuré sur le profil
      if (isAccountDigits && !/^0{10}$/.test(ccp10)) {
        if (isFirstLine) {
          ordonnateurAccount = accountFull20;
          if (rHeaderKey && profile.headerKeyAlgorithm !== 'none') {
            const keyRes = verifyAccountKey(accountPrefix8, ccp10, key2, profile.headerKeyAlgorithm);
            if (!keyRes.valid) {
              const isStrictCcp = profile.headerKeyAlgorithm === 'ccp-weighted';
              pushAnomaly(
                rHeaderKey,
                lineNumber,
                recordId,
                isStrictCcp ? 'Clé CCP Ordonnateur (Pos. 20–21)' : 'Clé Ordonnateur (Pos. 20–21)',
                key2,
                `Clé attendue : ${keyRes.expectedKey}`,
                `Clé invalide en ligne 1 pour le compte ${ccp10.replace(/^0+/, '') || '0'} : « ${key2} » détectée au lieu de « ${keyRes.expectedKey} ».${keyRes.alternateMatch ? ` (${keyRes.alternateMatch})` : ''}`,
                isStrictCcp
                  ? `Mode CCP strict actif : utilisez la clé CCP « ${keyRes.expectedKey} » (ou activez l’option Clé RIP/CCP dans le profil).`
                  : `Vérifiez la clé du compte ordonnateur : valeurs valides pour ce compte : ${keyRes.expectedKey}.`,
                rec
              );
            }
          }
        } else if (rKey && profile.detailKeyAlgorithm !== 'none') {
          const keyRes = verifyAccountKey(accountPrefix8, ccp10, key2, profile.detailKeyAlgorithm);
          if (!keyRes.valid) {
            const isStrictCcp = profile.detailKeyAlgorithm === 'ccp-weighted';
            pushAnomaly(
              rKey,
              lineNumber,
              recordId,
              isStrictCcp ? 'Clé CCP (Pos. 20–21)' : 'Clé de contrôle (Pos. 20–21)',
              key2,
              `Clé calculée : ${keyRes.expectedKey}`,
              `Clé invalide pour le compte ${ccp10.replace(/^0+/, '') || '0'} : « ${key2} » détectée au lieu de « ${keyRes.expectedKey} ».${keyRes.alternateMatch ? ` (${keyRes.alternateMatch})` : ''}`,
              isStrictCcp
                ? `Mode CCP strict actif : la clé CCP attendue est « ${keyRes.expectedKey} » (vérifiez la clé CCP auprès du bénéficiaire).`
                : `Clé non reconnue ni comme Clé CCP ni comme Clé RIP. Valeurs valides pour ce compte : ${keyRes.expectedKey}.`,
              rec
            );
          }
        }
      }

      // 8. Montant sur 13 chiffres
      const isAmountDigits = /^\d{13}$/.test(amountRaw);
      if (isAmountDigits) {
        const centimes = Number(amountRaw);
        rec.amountCentimes = centimes;
        if (isFirstLine) {
          declaredTotalCentimes = centimes;
        } else {
          computedTotalCentimes += centimes;
        }
        if (rAmount && centimes < profile.minAmountCentimes) {
          pushAnomaly(
            rAmount,
            lineNumber,
            recordId,
            isFirstLine ? 'Montant global (Pos. 22–34)' : 'Montant (Pos. 22–34)',
            amountRaw,
            `Montant > ${formatDZD(profile.minAmountCentimes - 1, profile.amountImpliedDecimals)}`,
            'Montant nul détecté (0,00 DA).',
            'Vérifiez le montant du bénéficiaire.',
            rec
          );
        }
      } else if (rAmount) {
        pushAnomaly(
          rAmount,
          lineNumber,
          recordId,
          isFirstLine ? 'Montant global (Pos. 22–34)' : 'Montant (Pos. 22–34)',
          amountRaw,
          '13 chiffres stricts (centimes)',
          `Montant non numérique ou mal positionné (« ${amountRaw} »).`,
          'Renseignez le montant en centimes sur 13 chiffres.',
          rec
        );
      }

      // 9. Champs Ligne 1 vs Lignes 2..N
      if (isFirstLine) {
        const declaredCountRaw = rawLine.slice(34, 41);
        const monthRaw = rawLine.slice(41, 43);
        const yearRaw = rawLine.slice(43, 47);
        const reservedSpacesRaw = rawLine.slice(47, 61);

        rec.declaredCountRaw = declaredCountRaw;
        rec.monthRaw = monthRaw;
        rec.yearRaw = yearRaw;
        rec.reservedSpacesRaw = reservedSpacesRaw;

        if (/^\d{7}$/.test(declaredCountRaw)) {
          declaredBeneficiaryCount = Number(declaredCountRaw);
        } else if (rHeaderPeriod) {
          pushAnomaly(
            rHeaderPeriod,
            lineNumber,
            recordId,
            'Nombre bénéficiaires (Pos. 35–41)',
            declaredCountRaw,
            '7 chiffres stricts',
            `Nombre déclaré invalide en ligne 1 (« ${declaredCountRaw} »).`,
            'Formatez le nombre de lignes bénéficiaires sur 7 chiffres.',
            rec
          );
        }

        const monthNum = Number(monthRaw);
        const yearNum = Number(yearRaw);
        if (/^\d{2}$/.test(monthRaw) && monthNum >= 1 && monthNum <= 12 && /^\d{4}$/.test(yearRaw)) {
          headerPeriod = `${monthRaw}/${yearRaw}`;
        }

        if (rHeaderPeriod) {
          if (!/^\d{2}$/.test(monthRaw) || monthNum < 1 || monthNum > 12) {
            pushAnomaly(
              rHeaderPeriod,
              lineNumber,
              recordId,
              'Mois (Pos. 42–43)',
              monthRaw,
              '01 à 12',
              `Mois invalide en ligne 1 (« ${monthRaw} »).`,
              'Saisissez un mois valide sur 2 chiffres (01–12).',
              rec
            );
          }
          if (!/^\d{4}$/.test(yearRaw) || yearNum < 2000 || yearNum > 2100) {
            pushAnomaly(
              rHeaderPeriod,
              lineNumber,
              recordId,
              'Année (Pos. 44–47)',
              yearRaw,
              '4 chiffres (2000–2100)',
              `Année invalide en ligne 1 (« ${yearRaw} »).`,
              'Saisissez l’année sur 4 chiffres.',
              rec
            );
          }
          if (reservedSpacesRaw !== ' '.repeat(14)) {
            pushAnomaly(
              rHeaderPeriod,
              lineNumber,
              recordId,
              'Zone réservée (Pos. 48–61)',
              `«${reservedSpacesRaw}» (${reservedSpacesRaw.length} car.)`,
              'Exactement 14 espaces',
              'Les positions 48 à 61 de la ligne 1 doivent contenir exactement 14 espaces.',
              'Remplacez cette zone par 14 espaces.',
              rec
            );
          }
        }
      } else {
        detailLineCount++;
        const beneficiaryRaw = rawLine.slice(34, 61);
        const beneficiaryTrimmed = beneficiaryRaw.trim();
        rec.beneficiaryRaw = beneficiaryRaw;
        rec.beneficiaryTrimmed = beneficiaryTrimmed;

        if (rName) {
          if (beneficiaryTrimmed.length === 0) {
            pushAnomaly(
              rName,
              lineNumber,
              recordId,
              'Nom et Prénom (Pos. 35–61)',
              '(vide)',
              'Obligatoire (27 caractères)',
              'Le nom et prénom du bénéficiaire est vide.',
              'Complétez le nom et le prénom du bénéficiaire.',
              rec
            );
          } else {
            const check = isNameValid(beneficiaryRaw, profile.allowArabicNames, profile.allowAccentedNames);
            if (!check.ok) {
              pushAnomaly(
                rName,
                lineNumber,
                recordId,
                'Nom et Prénom (Pos. 35–61)',
                beneficiaryTrimmed,
                profile.allowAccentedNames
                  ? 'Lettres, espaces, tirets ou apostrophes uniquement'
                  : 'Lettres sans accents ni caractères spéciaux',
                `Caractère(s) interdit(s) dans le nom : ${check.badChars.join(', ')}.`,
                'Supprimez ou remplacez les caractères non autorisés.',
                rec
              );
            }
          }
        }

        if (rDup) {
          const prevLineExact = seenExactLineMap.get(rawLine);
          if (prevLineExact !== undefined) {
            repeatedLines++;
            pushAnomaly(
              rDup,
              lineNumber,
              recordId,
              'Ligne entière',
              `Identique à la ligne ${prevLineExact}`,
              'Enregistrement unique',
              `Ligne dupliquée à l’identique (ligne ${prevLineExact}).`,
              'Vérifiez qu’il ne s’agit pas d’un doublon involontaire.',
              rec
            );
          } else {
            seenExactLineMap.set(rawLine, lineNumber);
          }

          if (isAccountDigits) {
            const prevAccLine = seenAccountMap.get(accountFull20);
            if (prevAccLine !== undefined && prevLineExact === undefined) {
              duplicateAccounts++;
              pushAnomaly(
                rDup,
                lineNumber,
                recordId,
                'Compte CCP (Pos. 2–21)',
                accountFull20,
                'Compte unique par bénéficiaire',
                `Doublon de compte CCP détecté (déjà présent à la ligne ${prevAccLine}).`,
                'Vérifiez si plusieurs virements sont prévus pour ce même compte.',
                rec
              );
            } else if (prevAccLine === undefined) {
              seenAccountMap.set(accountFull20, lineNumber);
            } else {
              duplicateAccounts++;
            }
          }
        }

        if (rOrdInDet && ordonnateurAccount && accountFull20 === ordonnateurAccount) {
          pushAnomaly(
            rOrdInDet,
            lineNumber,
            recordId,
            'Compte CCP (Pos. 2–21)',
            accountFull20,
            'Distinct du compte ordonnateur',
            'Le compte bénéficiaire est identique au compte ordonnateur de la ligne 1.',
            'Vérifiez cette ligne avant validation.',
            rec
          );
        }
      }

      records.push(rec);
    }

    if (notEmptyRule && detailLineCount === 0) {
      pushAnomaly(
        notEmptyRule,
        1,
        'Fichier',
        'Lignes bénéficiaires',
        '0 bénéficiaire',
        'Au moins 1 bénéficiaire (type 1)',
        'Le fichier non-RIP ne contient aucun bénéficiaire.',
        'Ajoutez les enregistrements bénéficiaires.'
      );
    }

    const rGlobalAmount = getRule(profile, 'nonrip-global-amount-coherence');
    if (rGlobalAmount && declaredTotalCentimes !== null && declaredTotalCentimes !== computedTotalCentimes) {
      const diff = computedTotalCentimes - declaredTotalCentimes;
      pushAnomaly(
        rGlobalAmount,
        1,
        ordonnateurAccount ?? 'Ligne 1',
        'Montant global (Pos. 22–34)',
        formatDZD(declaredTotalCentimes, profile.amountImpliedDecimals),
        `Somme calculée : ${formatDZD(computedTotalCentimes, profile.amountImpliedDecimals)}`,
        `Écart de montant global : ${formatDZD(declaredTotalCentimes, profile.amountImpliedDecimals)} déclaré contre ${formatDZD(computedTotalCentimes, profile.amountImpliedDecimals)} calculé (écart : ${diff > 0 ? '+' : ''}${formatDZD(diff, profile.amountImpliedDecimals)}).`,
        `Corrigez le montant global ligne 1 à ${String(computedTotalCentimes).padStart(13, '0')} après contrôle.`
      );
    }

    const rGlobalCount = getRule(profile, 'nonrip-global-count-coherence');
    if (rGlobalCount && declaredBeneficiaryCount !== null && declaredBeneficiaryCount !== detailLineCount) {
      pushAnomaly(
        rGlobalCount,
        1,
        ordonnateurAccount ?? 'Ligne 1',
        'Nombre bénéficiaires (Pos. 35–41)',
        String(declaredBeneficiaryCount),
        `Nombre réel : ${detailLineCount}`,
        `Écart sur le nombre de bénéficiaires : ${declaredBeneficiaryCount} déclaré(s) en ligne 1 contre ${detailLineCount} ligne(s) trouvée(s).`,
        `Ajustez le compteur ligne 1 à ${String(detailLineCount).padStart(7, '0')}.`
      );
    }

    onProgress?.(totalLines, totalLines);

    return {
      records,
      anomalies,
      declaredTotalCentimes,
      computedTotalCentimes,
      declaredBeneficiaryCount,
      headerPeriod,
      ordonnateurAccount,
      duplicateAccounts,
      repeatedLines,
    };
  }

  // BRANCHE B : Format tabulaire CSV / Excel — non-RIP (Compte CCP ; Clé ; Montant ; Nom)
  const rows = decoded.spreadsheetRows ?? decoded.rawLines.map((l) => parseDelimitedLine(l, profile.delimiter));
  const startRow = profile.hasHeaderRow ? 1 : 0;
  let computedTotalCentimes = 0;
  let duplicateAccounts = 0;
  let repeatedLines = 0;
  const seenAcc = new Map<string, number>();
  const seenRow = new Map<string, number>();

  const rPrefix = getRule(profile, 'nonrip-prefix-00000000');
  const rDigits = getRule(profile, 'nonrip-digits-only');
  const rKey = getRule(profile, 'nonrip-key-check');
  const rAmount = getRule(profile, 'nonrip-amount-format');
  const rName = getRule(profile, 'nonrip-beneficiary-name');
  const rDup = getRule(profile, 'nonrip-duplicates');

  for (let i = startRow; i < rows.length; i++) {
    if (signal?.aborted) throw new DOMException('Analyse annulée.', 'AbortError');
    if (i > startRow && i % 500 === 0) {
      onProgress?.(i, rows.length);
      await new Promise((res) => setTimeout(res, 0));
    }
    const lineNumber = i + 1;
    const cols = rows[i];
    const rawLine = decoded.rawLines[i] ?? cols.join(profile.delimiter);
    if (cols.every((c) => c.trim() === '')) continue;

    const accRaw = (cols[profile.columnMap.account] ?? '').replace(/\s+/g, '');
    const keyRaw = profile.columnMap.key !== undefined ? (cols[profile.columnMap.key] ?? '').trim() : '';
    const amountStr = (cols[profile.columnMap.amount] ?? '').trim();
    const nameStr = (cols[profile.columnMap.beneficiary] ?? '').trim();

    const parsedAmount = Number(amountStr.replace(/\s/g, '').replace(',', '.'));
    const centimes = Number.isFinite(parsedAmount)
      ? Math.round(parsedAmount * Math.pow(10, profile.amountImpliedDecimals))
      : undefined;

    const rec: ParsedRecord = {
      lineNumber,
      rawLine,
      lineLength: rawLine.length,
      kind: 'detail',
      accountFull20: accRaw,
      ccp10: accRaw.padStart(10, '0'),
      key2: keyRaw,
      amountRaw: amountStr,
      amountCentimes: centimes,
      beneficiaryRaw: nameStr,
      beneficiaryTrimmed: nameStr,
      isValid: true,
      hasCriticalOrError: false,
      hasWarning: false,
      anomalyIds: [],
    };

    const recordId = accRaw || `Ligne ${lineNumber}`;

    if (rPrefix && accRaw.startsWith('00799999') && accRaw.length === 20) {
      pushAnomaly(
        rPrefix,
        lineNumber,
        recordId,
        'Colonne Compte CCP',
        accRaw,
        'Compte CCP non-RIP (sans préfixe 00799999)',
        'Un RIP complet (00799999...) a été détecté dans un fichier analysé en mode non-RIP.',
        'Utilisez le profil Tabulaire RIP.',
        rec
      );
    }

    if (rDigits && !/^\d{1,10}$/.test(accRaw)) {
      pushAnomaly(
        rDigits,
        lineNumber,
        recordId,
        'Colonne Compte CCP',
        accRaw || '(vide)',
        'Numéro CCP numérique (1 à 10 chiffres)',
        `Format de numéro CCP invalide (« ${accRaw} »).`,
        'Saisissez uniquement les chiffres du compte CCP.',
        rec
      );
    } else if (rKey && keyRaw && profile.detailKeyAlgorithm !== 'none') {
      const ccp10 = accRaw.padStart(10, '0');
      const keyRes = verifyAccountKey('00000000', ccp10, keyRaw, profile.detailKeyAlgorithm);
      if (!/^\d{2}$/.test(keyRaw) || !keyRes.valid) {
        const isStrictCcp = profile.detailKeyAlgorithm === 'ccp-weighted';
        pushAnomaly(
          rKey,
          lineNumber,
          recordId,
          isStrictCcp ? 'Colonne Clé CCP' : 'Colonne Clé (CCP / RIP)',
          keyRaw,
          `Clé attendue : ${keyRes.expectedKey}`,
          `Clé invalide (« ${keyRaw} » au lieu de « ${keyRes.expectedKey} »).${keyRes.alternateMatch ? ` (${keyRes.alternateMatch})` : ''}`,
          isStrictCcp
            ? `Mode CCP strict actif : la clé CCP attendue est « ${keyRes.expectedKey} ».`
            : `Clé non reconnue ni comme Clé CCP ni comme Clé RIP. Valeurs valides : ${keyRes.expectedKey}.`,
          rec
        );
      }
    }

    if (centimes !== undefined && centimes >= profile.minAmountCentimes) {
      computedTotalCentimes += centimes;
    } else if (rAmount) {
      pushAnomaly(
        rAmount,
        lineNumber,
        recordId,
        'Colonne Montant',
        amountStr || '(vide)',
        'Montant strictement positif',
        `Montant invalide ou nul (« ${amountStr} »).`,
        'Corrigez le montant.',
        rec
      );
    }

    if (rName && !nameStr) {
      pushAnomaly(
        rName,
        lineNumber,
        recordId,
        'Colonne Bénéficiaire',
        '(vide)',
        'Nom et prénom obligatoires',
        'Nom du bénéficiaire absent.',
        'Renseignez le nom et prénom.',
        rec
      );
    }

    if (rDup) {
      if (seenRow.has(rawLine)) {
        repeatedLines++;
        pushAnomaly(
          rDup,
          lineNumber,
          recordId,
          'Ligne complète',
          `Identique à la ligne ${seenRow.get(rawLine)}`,
          'Ligne unique',
          'Ligne dupliquée à l’identique.',
          'Supprimez la ligne en double si nécessaire.',
          rec
        );
      } else {
        seenRow.set(rawLine, lineNumber);
      }
      if (accRaw) {
        if (seenAcc.has(accRaw)) {
          duplicateAccounts++;
          pushAnomaly(
            rDup,
            lineNumber,
            recordId,
            'Colonne Compte CCP',
            accRaw,
            'Compte CCP unique',
            `Doublon de compte CCP (déjà présent à la ligne ${seenAcc.get(accRaw)}).`,
            'Confirmez la légitimité du doublon.',
            rec
          );
        } else {
          seenAcc.set(accRaw, lineNumber);
        }
      }
    }

    records.push(rec);
  }

  onProgress?.(rows.length, rows.length);

  return {
    records,
    anomalies,
    declaredTotalCentimes: null,
    computedTotalCentimes,
    declaredBeneficiaryCount: null,
    headerPeriod: null,
    ordonnateurAccount: null,
    duplicateAccounts,
    repeatedLines,
  };
}
