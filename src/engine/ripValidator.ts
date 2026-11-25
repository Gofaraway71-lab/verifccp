import {
  Anomaly,
  DecodedFileResult,
  ParsedRecord,
  RuleConfig,
  ValidationProfile,
} from '../types/ccp';
import { formatDZD, verifyAccountKey } from './cryptoKeys';
import { parseDelimitedLine } from './fileParser';

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

export interface ValidationEngineOutput {
  records: ParsedRecord[];
  anomalies: Anomaly[];
  declaredTotalCentimes: number | null;
  computedTotalCentimes: number;
  declaredBeneficiaryCount: number | null;
  headerPeriod: string | null;
  ordonnateurAccount: string | null;
  duplicateAccounts: number;
  repeatedLines: number;
}

/**
 * Moteur de validation dédié EXCLUSIVEMENT au format RIP (Algérie Poste).
 * Ne réutilise ni ne confond aucune règle du module non-RIP.
 */
export async function validateRipFile(
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
    const id = `RIP-ANM-${String(anomalySeq++).padStart(4, '0')}`;
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
      formatScope: 'rip',
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

  // Contrôles d'hygiène d'encodage globaux
  const encRule = getRule(profile, 'rip-encoding-hygiene');
  if (encRule) {
    if (decoded.hasReplacementChars) {
      pushAnomaly(
        encRule,
        0,
        'Fichier',
        'Encodage',
        decoded.detectedEncoding,
        'Caractères valides sans octet corrompu (U+FFFD)',
        'Des caractères de remplacement () ont été détectés : le fichier semble mal encodé.',
        'Ré-enregistrez le fichier source en UTF-8 ou sélectionnez l’encodage Windows-1252 / Windows-1256.'
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
        'Un marqueur d’ordre d’octets (BOM UTF-8) est présent en début de fichier et peut décaler le premier caractère (*).',
        'Utilisez la correction sûre pour exporter le fichier sans BOM.'
      );
    }
    if (decoded.invisibleCharCount > 0) {
      pushAnomaly(
        encRule,
        0,
        'Fichier',
        'Caractères invisibles',
        `${decoded.invisibleCharCount} occurrence(s)`,
        'Aucun caractère de contrôle ou espace insécable invisible',
        `${decoded.invisibleCharCount} caractère(s) invisible(s) ou de contrôle détecté(s).`,
        'Utilisez le nettoyage sûr pour supprimer les caractères invisibles.'
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
        'Le fichier mélange des fins de ligne Windows (CRLF) et Unix (LF).',
        'Utilisez la correction sûre pour normaliser les fins de ligne.'
      );
    }
  }

  const totalLines = decoded.rawLines.length;
  const notEmptyRule = getRule(profile, 'rip-file-not-empty');

  if (totalLines === 0 || decoded.rawLines.every((l) => l.trim().length === 0)) {
    if (notEmptyRule) {
      pushAnomaly(
        notEmptyRule,
        0,
        'Fichier',
        'Contenu',
        '0 ligne exploitable',
        'Au moins 1 ligne d’en-tête et 1 ligne bénéficiaire',
        'Le fichier RIP importé est vide.',
        'Importez un fichier CCP RIP contenant les enregistrements à vérifier.'
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

  // BRANCHE A : Format Largeur Fixe 62 caractères Algérie Poste (RIP)
  if (profile.structure === 'fixed-62') {
    let declaredTotalCentimes: number | null = null;
    let declaredBeneficiaryCount: number | null = null;
    let computedTotalCentimes = 0;
    let headerPeriod: string | null = null;
    let ordonnateurAccount: string | null = null;
    let detailLineCount = 0;
    let duplicateAccounts = 0;
    let repeatedLines = 0;

    const seenRipMap = new Map<string, number>();
    const seenExactLineMap = new Map<string, number>();

    const rEmptyLine = getRule(profile, 'rip-empty-lines');
    const rLen = getRule(profile, 'rip-line-length');
    const rStar = getRule(profile, 'rip-star-prefix');
    const rType = getRule(profile, 'rip-type-code');
    const rPrefix = getRule(profile, 'rip-prefix-00799999');
    const rDigits = getRule(profile, 'rip-digits-only');
    const rNonZero = getRule(profile, 'rip-nonzero-account');
    const rKey = getRule(profile, 'rip-key-check');
    const rHeaderKey = getRule(profile, 'rip-header-key-check');
    const rAmount = getRule(profile, 'rip-amount-format');
    const rHeaderPeriod = getRule(profile, 'rip-header-period');
    const rName = getRule(profile, 'rip-beneficiary-name');
    const rDup = getRule(profile, 'rip-duplicates');
    const rOrdInDet = getRule(profile, 'rip-ordonnateur-in-details');

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

      // Ligne vide
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
            'Enregistrement RIP de 62 caractères',
            'Ligne vide détectée dans le fichier RIP.',
            'Supprimez la ligne vide avant transmission à Algérie Poste.',
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

      // 1. Longueur fixe exacte (62 caractères)
      if (rLen && rawLine.length !== profile.fixedLineLength) {
        rec.kind = isFirstLine ? 'header' : rawLine.length < 34 ? 'malformed' : 'detail';
        pushAnomaly(
          rLen,
          lineNumber,
          recordId,
          'Longueur ligne',
          `${rawLine.length} caractère(s)`,
          `Exactement ${profile.fixedLineLength} caractères`,
          `Longueur non conforme : ${rawLine.length} caractères au lieu de ${profile.fixedLineLength} (${rawLine.length < profile.fixedLineLength ? 'données tronquées ou espaces manquants' : 'caractères en excès'}).`,
          rawLine.length < profile.fixedLineLength
            ? 'Vérifiez la zone Nom/Prénom (27 car.) ou les 14 espaces d’en-tête.'
            : 'Supprimez les caractères excédentaires en fin de ligne.',
          rec
        );
      }

      // 2. Caractère de début '*'
      if (rStar && prefixChar !== profile.linePrefixChar) {
        pushAnomaly(
          rStar,
          lineNumber,
          recordId,
          'Préfixe ligne (Pos. 1)',
          prefixChar || '(vide)',
          `Caractère « ${profile.linePrefixChar} »`,
          `La ligne doit impérativement débuter par « ${profile.linePrefixChar} ».`,
          `Ajoutez ou rétablissez « ${profile.linePrefixChar} » en position 1.`,
          rec
        );
      }

      // 3. Code type en position 62 ('0' pour ligne 1, '1' pour lignes 2..N)
      const expectedType = isFirstLine ? profile.headerTypeCode : profile.detailTypeCode;
      if (rType && rawLine.length >= profile.fixedLineLength && typeCode !== expectedType) {
        pushAnomaly(
          rType,
          lineNumber,
          recordId,
          'Type ligne (Pos. 62)',
          typeCode,
          isFirstLine ? `« ${profile.headerTypeCode} » (En-tête)` : `« ${profile.detailTypeCode} » (Bénéficiaire)`,
          isFirstLine
            ? `La ligne 1 (en-tête) doit se terminer par « ${profile.headerTypeCode} », valeur « ${typeCode} » détectée.`
            : `La ligne bénéficiaire doit se terminer par « ${profile.detailTypeCode} », valeur « ${typeCode} » détectée.`,
          `Corrigez le code type en position 62 en « ${expectedType} ».`,
          rec
        );
      }

      // 4. Contrôle RIP strict (20 chiffres)
      const isAccountDigits = /^\d{20}$/.test(accountFull20);
      if (rDigits && !isAccountDigits) {
        pushAnomaly(
          rDigits,
          lineNumber,
          recordId,
          'RIP (Pos. 2–21)',
          accountFull20,
          '20 chiffres stricts (0–9)',
          `Le champ RIP contient des caractères non numériques ou est incomplet (« ${accountFull20} »).`,
          'Vérifiez que le RIP comporte exactement 20 chiffres sans espace ni lettre.',
          rec
        );
      }

      // 5. Préfixe RIP 00799999 obligatoire (rejet explicite du non-RIP 00000000)
      if (rPrefix) {
        if (accountPrefix8 === profile.forbiddenAccountPrefix) {
          pushAnomaly(
            rPrefix,
            lineNumber,
            recordId,
            'Préfixe RIP (Pos. 2–9)',
            accountPrefix8,
            `Préfixe RIP « ${profile.accountPrefixExpected} »`,
            `Préfixe non-RIP (« ${accountPrefix8} ») détecté dans un contrôle RIP : ce compte n’est pas au format RIP Algérie Poste.`,
            `Utilisez le profil « Format non-RIP » ou convertissez le compte en RIP (00799999 + CCP 10 chiffres + clé RIP) après vérification.`,
            rec
          );
        } else if (accountPrefix8 !== profile.accountPrefixExpected) {
          pushAnomaly(
            rPrefix,
            lineNumber,
            recordId,
            'Préfixe RIP (Pos. 2–9)',
            accountPrefix8,
            `Préfixe RIP « ${profile.accountPrefixExpected} »`,
            `Préfixe bancaire/guichet invalide pour un RIP Algérie Poste (« ${accountPrefix8} » au lieu de « ${profile.accountPrefixExpected} »).`,
            `Un RIP Algérie Poste commence toujours par ${profile.accountPrefixExpected}.`,
            rec
          );
        }
      }

      // 6. Numéro de compte CCP non nul (pos 10–19)
      if (rNonZero && isAccountDigits && /^0{10}$/.test(ccp10)) {
        pushAnomaly(
          rNonZero,
          lineNumber,
          recordId,
          'Compte CCP (Pos. 10–19)',
          ccp10,
          'Compte CCP différent de 0000000000',
          'Le numéro de compte CCP inclus dans le RIP est entièrement nul.',
          'Renseignez un numéro de compte CCP valide sur 10 chiffres.',
          rec
        );
      }

      // 7. Vérification mathématique de la clé (pos 20–21) selon l'algorithme configuré sur le profil
      if (isAccountDigits && !/^0{10}$/.test(ccp10)) {
        if (isFirstLine) {
          ordonnateurAccount = accountFull20;
          if (rHeaderKey && profile.headerKeyAlgorithm !== 'none') {
            const keyRes = verifyAccountKey(accountPrefix8, ccp10, key2, profile.headerKeyAlgorithm);
            if (!keyRes.valid) {
              const isStrictRip = profile.headerKeyAlgorithm === 'rip-mod97-85';
              pushAnomaly(
                rHeaderKey,
                lineNumber,
                recordId,
                isStrictRip ? 'Clé RIP Ordonnateur (Pos. 20–21)' : 'Clé Ordonnateur (Pos. 20–21)',
                key2,
                `Clé attendue : ${keyRes.expectedKey}`,
                `Clé invalide en ligne 1 pour le compte ${ccp10.replace(/^0+/, '') || '0'} : « ${key2} » détectée au lieu de « ${keyRes.expectedKey} ».${keyRes.alternateMatch ? ` (${keyRes.alternateMatch})` : ''}`,
                isStrictRip
                  ? `Mode RIP strict actif (attend la Clé RIP Mod 97+85 « ${keyRes.expectedKey} »). Si votre fichier Algérie Poste utilise la Clé CCP « ${key2} » avec le préfixe 00799999, activez « Algérie Poste — Clé CCP ou Clé RIP acceptée » dans Profils et règles.`
                  : `Vérifiez la clé du compte ordonnateur : valeurs valides pour ce compte : ${keyRes.expectedKey}.`,
                rec
              );
            }
          }
        } else if (rKey && profile.detailKeyAlgorithm !== 'none') {
          const keyRes = verifyAccountKey(accountPrefix8, ccp10, key2, profile.detailKeyAlgorithm);
          if (!keyRes.valid) {
            const isStrictRip = profile.detailKeyAlgorithm === 'rip-mod97-85';
            pushAnomaly(
              rKey,
              lineNumber,
              recordId,
              isStrictRip ? 'Clé RIP (Pos. 20–21)' : 'Clé de contrôle (Pos. 20–21)',
              key2,
              `Clé calculée : ${keyRes.expectedKey}`,
              `Clé invalide pour le compte ${ccp10.replace(/^0+/, '') || '0'} : « ${key2} » détectée au lieu de « ${keyRes.expectedKey} ».${keyRes.alternateMatch ? ` (${keyRes.alternateMatch})` : ''}`,
              isStrictRip
                ? `Mode RIP strict actif (attend la Clé RIP Mod 97+85 « ${keyRes.expectedKey} »). Si votre fichier Algérie Poste utilise la Clé CCP « ${key2} » avec le préfixe 00799999, activez « Algérie Poste — Clé CCP ou Clé RIP acceptée » dans Profils et règles.`
                : `Clé non reconnue ni comme Clé RIP ni comme Clé CCP. Valeurs valides pour ce compte : ${keyRes.expectedKey}.`,
              rec
            );
          }
        }
      }

      // 8. Montant sur 13 chiffres (pos 22–34)
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
            'Le montant est nul (0,00 DA) alors qu’un montant strictement positif est exigé.',
            'Vérifiez le montant du virement pour cet enregistrement.',
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
          '13 chiffres stricts (montant en centimes)',
          `Format de montant invalide (« ${amountRaw} ») : 13 chiffres sans signe ni séparateur décimal sont attendus.`,
          'Formatez le montant en centimes sur 13 chiffres complétés par des zéros à gauche.',
          rec
        );
      }

      // 9. Champs spécifiques Ligne 1 (En-tête) vs Lignes 2..N (Bénéficiaires)
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
            `Le compteur de bénéficiaires en ligne 1 (« ${declaredCountRaw} ») n’est pas un entier sur 7 chiffres.`,
            'Formatez le nombre de lignes bénéficiaires sur 7 chiffres avec zéros à gauche.',
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
              'Mois valide entre 01 et 12',
              `Mois invalide en ligne 1 (« ${monthRaw} »).`,
              'Saisissez le mois sur 2 chiffres (01 à 12).',
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
              'Année sur 4 chiffres (2000–2100)',
              `Année invalide en ligne 1 (« ${yearRaw} »).`,
              'Saisissez l’année sur 4 chiffres (ex. 2026).',
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
              'La zone réservée de la ligne d’en-tête doit contenir exactement 14 espaces.',
              'Remplacez les positions 48 à 61 par 14 espaces.',
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
              'Nom et prénom obligatoires sur 27 caractères',
              'Le nom et prénom du bénéficiaire est manquant.',
              'Renseignez le nom et le prénom du bénéficiaire sur la zone de 27 caractères.',
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
                  : 'Lettres ASCII majuscules/minuscules sans accents ni caractères spéciaux',
                `Caractère(s) non autorisé(s) détecté(s) dans le nom du bénéficiaire : ${check.badChars.join(', ')}.`,
                'Remplacez les caractères interdits ou accents conformément aux règles du profil.',
                rec
              );
            }
          }
        }

        // Doublons RIP et lignes répétées
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
              `Ligne strictement dupliquée (identique à la ligne ${prevLineExact}).`,
              'Vérifiez qu’il ne s’agit pas d’un double virement accidentel.',
              rec
            );
          } else {
            seenExactLineMap.set(rawLine, lineNumber);
          }

          if (isAccountDigits) {
            const prevRipLine = seenRipMap.get(accountFull20);
            if (prevRipLine !== undefined && prevLineExact === undefined) {
              duplicateAccounts++;
              pushAnomaly(
                rDup,
                lineNumber,
                recordId,
                'RIP (Pos. 2–21)',
                accountFull20,
                'RIP unique par bénéficiaire',
                `Doublon de RIP détecté : ce compte apparaît déjà à la ligne ${prevRipLine}.`,
                'Confirmez si ce bénéficiaire doit recevoir plusieurs virements dans le même lot.',
                rec
              );
            } else if (prevRipLine === undefined) {
              seenRipMap.set(accountFull20, lineNumber);
            } else {
              duplicateAccounts++;
            }
          }
        }

        // Compte ordonnateur dans les bénéficiaires
        if (rOrdInDet && ordonnateurAccount && accountFull20 === ordonnateurAccount) {
          pushAnomaly(
            rOrdInDet,
            lineNumber,
            recordId,
            'RIP (Pos. 2–21)',
            accountFull20,
            'Distinct du compte ordonnateur (Ligne 1)',
            'Le compte bénéficiaire est identique au compte ordonnateur déclaré en ligne 1.',
            'Vérifiez s’il ne s’agit pas d’une erreur de saisie du compte.',
            rec
          );
        }
      }

      records.push(rec);
    }

    // Contrôles globaux de cohérence (Ligne 1 vs Somme et nombre des lignes 2..N)
    if (notEmptyRule && detailLineCount === 0) {
      pushAnomaly(
        notEmptyRule,
        1,
        'Fichier',
        'Lignes bénéficiaires',
        '0 bénéficiaire',
        'Au moins 1 ligne bénéficiaire (type 1)',
        'Le fichier ne contient que la ligne d’en-tête sans aucun bénéficiaire.',
        'Ajoutez au moins un enregistrement bénéficiaire.'
      );
    }

    const rGlobalAmount = getRule(profile, 'rip-global-amount-coherence');
    if (rGlobalAmount && declaredTotalCentimes !== null && declaredTotalCentimes !== computedTotalCentimes) {
      const diff = computedTotalCentimes - declaredTotalCentimes;
      pushAnomaly(
        rGlobalAmount,
        1,
        ordonnateurAccount ?? 'Ligne 1',
        'Montant global (Pos. 22–34)',
        formatDZD(declaredTotalCentimes, profile.amountImpliedDecimals),
        `Somme calculée : ${formatDZD(computedTotalCentimes, profile.amountImpliedDecimals)}`,
        `Écart de montant global : la ligne 1 déclare ${formatDZD(declaredTotalCentimes, profile.amountImpliedDecimals)} alors que la somme des ${detailLineCount} bénéficiaire(s) vaut ${formatDZD(computedTotalCentimes, profile.amountImpliedDecimals)} (écart : ${diff > 0 ? '+' : ''}${formatDZD(diff, profile.amountImpliedDecimals)}).`,
        `Corrigez le montant global en ligne 1 à ${String(computedTotalCentimes).padStart(13, '0')} ou vérifiez les montants individuels.`
      );
    }

    const rGlobalCount = getRule(profile, 'rip-global-count-coherence');
    if (rGlobalCount && declaredBeneficiaryCount !== null && declaredBeneficiaryCount !== detailLineCount) {
      pushAnomaly(
        rGlobalCount,
        1,
        ordonnateurAccount ?? 'Ligne 1',
        'Nombre bénéficiaires (Pos. 35–41)',
        String(declaredBeneficiaryCount),
        `Nombre réel : ${detailLineCount}`,
        `Écart de comptage : la ligne 1 annonce ${declaredBeneficiaryCount} bénéficiaire(s), mais ${detailLineCount} ligne(s) bénéficiaire(s) ont été trouvées.`,
        `Mettez à jour le compteur ligne 1 à ${String(detailLineCount).padStart(7, '0')} après vérification.`
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

  // BRANCHE B : Format tabulaire CSV / Excel — RIP
  const rows = decoded.spreadsheetRows ?? decoded.rawLines.map((l) => parseDelimitedLine(l, profile.delimiter));
  const startRow = profile.hasHeaderRow ? 1 : 0;
  let computedTotalCentimes = 0;
  let duplicateAccounts = 0;
  let repeatedLines = 0;
  const seenRip = new Map<string, number>();
  const seenRow = new Map<string, number>();

  const rPrefix = getRule(profile, 'rip-prefix-00799999');
  const rDigits = getRule(profile, 'rip-digits-only');
  const rKey = getRule(profile, 'rip-key-check');
  const rAmount = getRule(profile, 'rip-amount-format');
  const rName = getRule(profile, 'rip-beneficiary-name');
  const rDup = getRule(profile, 'rip-duplicates');

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

    const ripRaw = (cols[profile.columnMap.account] ?? '').replace(/\s+/g, '');
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
      accountFull20: ripRaw,
      accountPrefix8: ripRaw.slice(0, 8),
      ccp10: ripRaw.slice(8, 18),
      key2: ripRaw.slice(18, 20),
      amountRaw: amountStr,
      amountCentimes: centimes,
      beneficiaryRaw: nameStr,
      beneficiaryTrimmed: nameStr,
      isValid: true,
      hasCriticalOrError: false,
      hasWarning: false,
      anomalyIds: [],
    };

    const recordId = ripRaw || `Ligne ${lineNumber}`;

    if (rDigits && !/^\d{20}$/.test(ripRaw)) {
      pushAnomaly(
        rDigits,
        lineNumber,
        recordId,
        'Colonne RIP',
        ripRaw || '(vide)',
        '20 chiffres stricts',
        'Le RIP doit contenir exactement 20 chiffres.',
        'Corrigez le numéro RIP dans la colonne dédiée.',
        rec
      );
    } else {
      if (rPrefix && !ripRaw.startsWith(profile.accountPrefixExpected)) {
        pushAnomaly(
          rPrefix,
          lineNumber,
          recordId,
          'Préfixe RIP',
          ripRaw.slice(0, 8),
          profile.accountPrefixExpected,
          `Préfixe RIP invalide (« ${ripRaw.slice(0, 8)} »).`,
          `Un RIP Algérie Poste doit débuter par ${profile.accountPrefixExpected}.`,
          rec
        );
      }
      if (rKey && profile.detailKeyAlgorithm !== 'none') {
        const keyRes = verifyAccountKey(ripRaw.slice(0, 8), ripRaw.slice(8, 18), ripRaw.slice(18, 20), profile.detailKeyAlgorithm);
        if (!keyRes.valid) {
          const isStrictRip = profile.detailKeyAlgorithm === 'rip-mod97-85';
          pushAnomaly(
            rKey,
            lineNumber,
            recordId,
            isStrictRip ? 'Clé RIP' : 'Clé de contrôle (CCP / RIP)',
            ripRaw.slice(18, 20),
            `Clé attendue : ${keyRes.expectedKey}`,
            `Clé invalide (« ${ripRaw.slice(18, 20)} » au lieu de « ${keyRes.expectedKey} »).${keyRes.alternateMatch ? ` (${keyRes.alternateMatch})` : ''}`,
            isStrictRip
              ? `Mode RIP strict actif : la clé RIP attendue est « ${keyRes.expectedKey} » (ou activez l’option Clé CCP/RIP dans Profils et règles).`
              : `Clé non reconnue ni comme Clé RIP ni comme Clé CCP. Valeurs valides : ${keyRes.expectedKey}.`,
            rec
          );
        }
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
        'Nombre strictement positif',
        `Montant invalide ou nul (« ${amountStr} »).`,
        'Saisissez un montant numérique positif.',
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
        'Nom du bénéficiaire manquant.',
        'Renseignez le bénéficiaire.',
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
          'Ligne strictement répétée.',
          'Supprimez le doublon si non intentionnel.',
          rec
        );
      } else {
        seenRow.set(rawLine, lineNumber);
      }
      if (/^\d{20}$/.test(ripRaw)) {
        if (seenRip.has(ripRaw)) {
          duplicateAccounts++;
          pushAnomaly(
            rDup,
            lineNumber,
            recordId,
            'Colonne RIP',
            ripRaw,
            'RIP unique',
            `Doublon de RIP (déjà présent à la ligne ${seenRip.get(ripRaw)}).`,
            'Vérifiez la présence en double de ce bénéficiaire.',
            rec
          );
        } else {
          seenRip.set(ripRaw, lineNumber);
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
