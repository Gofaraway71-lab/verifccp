import {
  Anomaly,
  DecodedFileResult,
  ParsedRecord,
  RuleConfig,
  ValidationProfile,
} from '../types/ccp';
import {
  findAlgerianBankByCode,
  formatDZD,
  validateBankRib,
  verifyAccountKey,
} from './cryptoKeys';
import { parseDelimitedLine } from './fileParser';
import { ValidationEngineOutput } from './ripValidator';

function getRule(profile: ValidationProfile, id: string): RuleConfig | undefined {
  return profile.rules.find((r) => r.id === id && r.enabled);
}

function isNameValid(
  name: string,
  allowArabic: boolean,
  allowAccented: boolean
): { ok: boolean; badChars: string[] } {
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

function parseFlexibleAmountToCentimes(raw: string, impliedDecimals: number): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  let cleaned = trimmed.replace(/[\s\u00A0]+/g, '').replace(/(DZD|DA)$/i, '');
  if (!cleaned) return undefined;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    cleaned = cleaned.replace(',', '.');
  }

  if (!/^\d+(\.\d+)?$/.test(cleaned)) return undefined;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.round(parsed * Math.pow(10, impliedDecimals));
}

function inferDelimitedColumns(
  headerRow: string[] | undefined,
  profile: ValidationProfile
): { account: number; key?: number; amount: number; beneficiary: number } {
  const fallback = { ...profile.columnMap };
  if (!profile.isBuiltIn || !profile.hasHeaderRow || !headerRow || headerRow.length === 0) {
    return fallback;
  }

  const norm = headerRow.map((h) =>
    h
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  );

  const accountIdx = norm.findIndex((h) => /\b(rib|rip|ccp|compte|account|iban)\b/.test(h));
  const keyIdx = norm.findIndex((h) => /^cl[eé]$|^key$/.test(h));
  const amountIdx = norm.findIndex((h) => /\b(montant|amount|salaire|net|somme|virement)\b/.test(h));
  const beneficiaryIdx = norm.findIndex((h) =>
    /\b(nom|beneficiaire|prenom|titulaire|salarie|agent)\b/.test(h)
  );

  const account = accountIdx >= 0 ? accountIdx : fallback.account;
  const amount = amountIdx >= 0 && amountIdx !== account ? amountIdx : fallback.amount;
  const beneficiary =
    beneficiaryIdx >= 0 && beneficiaryIdx !== account && beneficiaryIdx !== amount
      ? beneficiaryIdx
      : fallback.beneficiary;
  const key =
    keyIdx >= 0 && keyIdx !== account && keyIdx !== amount && keyIdx !== beneficiary
      ? keyIdx
      : fallback.key;

  return { account, key, amount, beneficiary };
}

/**
 * Moteur de validation dédié au format RIB (Relevé d'Identité Bancaire Algérien,
 * comptes en 001, 002, 003, 004, 005, 006, 008, 010...) avec validation de la clé Mod 97,
 * gestion mixte CCP/RIP si présent, et conversion interne vers le standard CCP.
 */
export async function validateRibFile(
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
    const id = `RIB-ANM-${String(anomalySeq++).padStart(4, '0')}`;
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
      formatScope: 'rib',
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
        'Des caractères de remplacement ont été détectés : le fichier semble mal encodé.',
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
  const hasSpreadsheetRows = Boolean(
    decoded.spreadsheetRows && decoded.spreadsheetRows.some((r) => r.some((c) => c.trim().length > 0))
  );

  if (!hasSpreadsheetRows && (totalLines === 0 || decoded.rawLines.every((l) => l.trim().length === 0))) {
    if (notEmptyRule) {
      pushAnomaly(
        notEmptyRule,
        0,
        'Fichier',
        'Contenu',
        '0 ligne exploitable',
        'Au moins 1 enregistrement bancaire valide',
        'Le fichier bancaire importé est vide.',
        'Importez un fichier RIB contenant les enregistrements à vérifier.'
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

  // BRANCHE A : Format Largeur Fixe 62 caractères — RIB Bancaire
  if (profile.structure === 'fixed-62') {
    let declaredTotalCentimes: number | null = null;
    let declaredBeneficiaryCount: number | null = null;
    let computedTotalCentimes = 0;
    let headerPeriod: string | null = null;
    let ordonnateurAccount: string | null = null;
    let detailLineCount = 0;
    let duplicateAccounts = 0;
    let repeatedLines = 0;

    const seenRib = new Map<string, number>();
    const seenExactLine = new Map<string, number>();

    const rEmptyLine = getRule(profile, 'rip-empty-lines');
    const rLen = getRule(profile, 'rip-line-length');
    const rStar = getRule(profile, 'rip-star-prefix');
    const rType = getRule(profile, 'rip-type-code');
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
      if (signal?.aborted) throw new DOMException('Analyse annulée.', 'AbortError');
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
            'Enregistrement RIB de 62 caractères',
            'Ligne vide détectée dans le fichier bancaire.',
            'Supprimez la ligne vide avant remise en banque.',
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
      const account10 = accountFull20.slice(8, 18);
      const key2 = accountFull20.slice(18, 20);
      const amountRaw = rawLine.slice(21, 34);
      const typeCode = rawLine.length >= 62 ? rawLine.slice(61, 62) : rawLine.slice(-1);

      const isCcpOrRipPrefix = accountPrefix8 === '00799999' || accountPrefix8 === '00000000';
      const isAccountDigits = /^\d{20}$/.test(accountFull20);
      const bankValidation = !isCcpOrRipPrefix && isAccountDigits ? validateBankRib(accountFull20) : null;

      const rec: ParsedRecord = {
        lineNumber,
        rawLine,
        lineLength: rawLine.length,
        kind: isFirstLine ? 'header' : 'detail',
        prefixChar,
        accountFull20,
        accountPrefix8,
        ccp10: bankValidation ? bankValidation.ccpEquivalent : account10,
        key2: bankValidation ? bankValidation.actualKey : key2,
        amountRaw,
        typeCode,
        bankRibDetails: bankValidation
          ? {
              bankCode: bankValidation.bankCode,
              branchCode: bankValidation.branchCode,
              accountNumber: bankValidation.accountNumber,
              actualKey: bankValidation.actualKey,
              expectedKey: bankValidation.expectedKey,
              validBankKey: bankValidation.valid,
              ccpEquivalent: bankValidation.ccpEquivalent,
            }
          : undefined,
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
          `Longueur non conforme (${rawLine.length} caractère(s) au lieu de ${profile.fixedLineLength}).`,
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

      // 4. Contrôle RIB / compte sur 20 chiffres stricts
      if (rDigits && !isAccountDigits) {
        pushAnomaly(
          rDigits,
          lineNumber,
          recordId,
          'RIB (Pos. 2–21)',
          accountFull20,
          '20 chiffres stricts (0–9)',
          `Le champ RIB contient des caractères non numériques ou est incomplet (« ${accountFull20} »).`,
          'Vérifiez que le RIB comporte exactement 20 chiffres sans espace ni lettre.',
          rec
        );
      }

      // 5. Numéro de compte / code banque non nul
      const hasZeroAccount = isAccountDigits && /^0{10}$/.test(account10);
      const hasZeroBank = isAccountDigits && !isCcpOrRipPrefix && accountFull20.slice(0, 3) === '000';
      if (rNonZero && (hasZeroAccount || hasZeroBank)) {
        pushAnomaly(
          rNonZero,
          lineNumber,
          recordId,
          hasZeroBank ? 'Code banque (Pos. 2–4)' : 'Numéro de compte (Pos. 10–19)',
          hasZeroBank ? accountFull20.slice(0, 3) : account10,
          hasZeroBank ? 'Code banque valide différent de 000' : 'Numéro de compte différent de 0000000000',
          hasZeroBank
            ? 'Le code banque (000) est invalide pour un RIB bancaire.'
            : 'Le numéro de compte sur 10 chiffres est entièrement nul.',
          'Renseignez un code banque et un numéro de compte valides.',
          rec
        );
      }

      // 6. Vérification mathématique de la clé (Mod 97 bancaire, ou CCP/RIP si ligne 00799999 / 00000000)
      if (isAccountDigits && !hasZeroAccount && !hasZeroBank) {
        if (isFirstLine) {
          ordonnateurAccount = accountFull20;
          if (rHeaderKey && profile.headerKeyAlgorithm !== 'none') {
            if (isCcpOrRipPrefix) {
              const keyRes = verifyAccountKey(accountPrefix8, account10, key2, 'ccp-or-rip');
              if (!keyRes.valid) {
                pushAnomaly(
                  rHeaderKey,
                  lineNumber,
                  recordId,
                  'Clé Ordonnateur CCP/RIP (Pos. 20–21)',
                  key2,
                  `Clé attendue : ${keyRes.expectedKey}`,
                  `Clé ordonnateur invalide en ligne 1 pour le compte CCP ${account10.replace(/^0+/, '') || '0'} : « ${key2} » détectée au lieu de « ${keyRes.expectedKey} ».`,
                  `Corrigez la clé ordonnateur (valeurs valides : ${keyRes.expectedKey}).`,
                  rec
                );
              }
            } else if (bankValidation && !bankValidation.valid) {
              const bankInfo = findAlgerianBankByCode(bankValidation.bankCode);
              const bankLabel = bankInfo ? `${bankValidation.bankCode} (${bankInfo.shortName})` : bankValidation.bankCode;
              pushAnomaly(
                rHeaderKey,
                lineNumber,
                recordId,
                'Clé RIB Ordonnateur Mod 97 (Pos. 20–21)',
                bankValidation.actualKey,
                `Clé Mod 97 attendue : ${bankValidation.expectedKey}`,
                `Clé RIB ordonnateur invalide en ligne 1 pour la banque ${bankLabel} : « ${bankValidation.actualKey} » détectée au lieu de « ${bankValidation.expectedKey} ».`,
                `Corrigez la clé RIB ordonnateur à ${bankValidation.expectedKey}.`,
                rec
              );
            }
          }
        } else if (rKey && profile.detailKeyAlgorithm !== 'none') {
          if (isCcpOrRipPrefix) {
            const keyRes = verifyAccountKey(accountPrefix8, account10, key2, 'ccp-or-rip');
            if (!keyRes.valid) {
              pushAnomaly(
                rKey,
                lineNumber,
                recordId,
                'Clé CCP / RIP (Pos. 20–21)',
                key2,
                `Clé attendue : ${keyRes.expectedKey}`,
                `Clé invalide pour le compte CCP ${account10.replace(/^0+/, '') || '0'} : « ${key2} » détectée au lieu de « ${keyRes.expectedKey} ».`,
                `Valeurs valides pour ce compte CCP : ${keyRes.expectedKey}.`,
                rec
              );
            }
          } else if (bankValidation && !bankValidation.valid) {
            const bankInfo = findAlgerianBankByCode(bankValidation.bankCode);
            const bankLabel = bankInfo ? `${bankValidation.bankCode} (${bankInfo.shortName})` : bankValidation.bankCode;
            pushAnomaly(
              rKey,
              lineNumber,
              recordId,
              'Clé RIB Mod 97 (Pos. 20–21)',
              bankValidation.actualKey,
              `Clé Mod 97 calculée : ${bankValidation.expectedKey}`,
              `Clé RIB invalide pour la banque ${bankLabel} : « ${bankValidation.actualKey} » détectée au lieu de « ${bankValidation.expectedKey} ».`,
              `Corrigez la clé RIB à ${bankValidation.expectedKey}.`,
              rec
            );
          }
        }
      }

      // 7. Montant sur 13 chiffres (pos 22–34)
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

      // 8. Ligne 1 En-tête vs Lignes 2..N Bénéficiaires
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
            const check = isNameValid(
              beneficiaryRaw,
              profile.allowArabicNames,
              profile.allowAccentedNames
            );
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

        if (rDup) {
          const prevExact = seenExactLine.get(rawLine);
          if (prevExact !== undefined) {
            repeatedLines++;
            pushAnomaly(
              rDup,
              lineNumber,
              recordId,
              'Ligne entière',
              `Identique à la ligne ${prevExact}`,
              'Ligne unique',
              `Ligne strictement dupliquée (identique à la ligne ${prevExact}).`,
              'Vérifiez qu’il ne s’agit pas d’un double virement accidentel.',
              rec
            );
          } else {
            seenExactLine.set(rawLine, lineNumber);
          }

          if (isAccountDigits) {
            const prevRib = seenRib.get(accountFull20);
            if (prevRib !== undefined && prevExact === undefined) {
              duplicateAccounts++;
              pushAnomaly(
                rDup,
                lineNumber,
                recordId,
                'RIB Bancaire (Pos. 2–21)',
                accountFull20,
                'RIB unique par bénéficiaire',
                `Doublon de RIB bancaire (déjà présent à la ligne ${prevRib}).`,
                'Confirmez si ce bénéficiaire doit recevoir plusieurs virements dans le même lot.',
                rec
              );
            } else if (prevRib === undefined) {
              seenRib.set(accountFull20, lineNumber);
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
            'RIB (Pos. 2–21)',
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
    if (
      rGlobalAmount &&
      declaredTotalCentimes !== null &&
      declaredTotalCentimes !== computedTotalCentimes
    ) {
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
    if (
      rGlobalCount &&
      declaredBeneficiaryCount !== null &&
      declaredBeneficiaryCount !== detailLineCount
    ) {
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

  // BRANCHE B : Format tabulaire CSV / Excel — RIB Bancaire
  const rows =
    decoded.spreadsheetRows ?? decoded.rawLines.map((l) => parseDelimitedLine(l, profile.delimiter));
  const startRow = profile.hasHeaderRow ? 1 : 0;
  const colMap = inferDelimitedColumns(rows[0], profile);

  let computedTotalCentimes = 0;
  let duplicateAccounts = 0;
  let repeatedLines = 0;
  let processedDataRows = 0;
  const seenRib = new Map<string, number>();
  const seenRow = new Map<string, number>();

  const rDigits = getRule(profile, 'rip-digits-only');
  const rNonZero = getRule(profile, 'rip-nonzero-account');
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

    processedDataRows++;

    let ribRaw = (cols[colMap.account] ?? '').replace(/[\s-]+/g, '');
    if (colMap.key !== undefined && /^\d{18}$/.test(ribRaw)) {
      const keyColDigits = (cols[colMap.key] ?? '').replace(/\D/g, '');
      if (/^\d{2}$/.test(keyColDigits)) {
        ribRaw = `${ribRaw}${keyColDigits}`;
      }
    }

    const amountStr = (cols[colMap.amount] ?? '').trim();
    const nameStr = (cols[colMap.beneficiary] ?? '').trim();

    const centimes = parseFlexibleAmountToCentimes(amountStr, profile.amountImpliedDecimals);
    const isAccountDigits = /^\d{20}$/.test(ribRaw);
    const accountPrefix8 = ribRaw.slice(0, 8);
    const account10 = ribRaw.slice(8, 18);
    const key2 = ribRaw.slice(18, 20);
    const isCcpOrRipPrefix = accountPrefix8 === '00799999' || accountPrefix8 === '00000000';
    const bankValidation = !isCcpOrRipPrefix && isAccountDigits ? validateBankRib(ribRaw) : null;

    const rec: ParsedRecord = {
      lineNumber,
      rawLine,
      lineLength: rawLine.length,
      kind: 'detail',
      accountFull20: ribRaw,
      accountPrefix8,
      ccp10: bankValidation ? bankValidation.ccpEquivalent : account10,
      key2: bankValidation ? bankValidation.actualKey : key2,
      amountRaw: amountStr,
      amountCentimes: centimes,
      beneficiaryRaw: nameStr,
      beneficiaryTrimmed: nameStr,
      bankRibDetails: bankValidation
        ? {
            bankCode: bankValidation.bankCode,
            branchCode: bankValidation.branchCode,
            accountNumber: bankValidation.accountNumber,
            actualKey: bankValidation.actualKey,
            expectedKey: bankValidation.expectedKey,
            validBankKey: bankValidation.valid,
            ccpEquivalent: bankValidation.ccpEquivalent,
          }
        : undefined,
      isValid: true,
      hasCriticalOrError: false,
      hasWarning: false,
      anomalyIds: [],
    };

    const recordId = ribRaw || `Ligne ${lineNumber}`;

    if (rDigits && !isAccountDigits) {
      pushAnomaly(
        rDigits,
        lineNumber,
        recordId,
        'RIB Bancaire (20 chiffres)',
        ribRaw || '(vide)',
        'Exactement 20 chiffres (Code banque + guichet + compte + clé)',
        `Le RIB bancaire ne comporte pas 20 chiffres (« ${ribRaw || '(vide)'} »).`,
        'Vérifiez la saisie du Relevé d’Identité Bancaire.',
        rec
      );
    } else if (isAccountDigits) {
      const hasZeroAccount = /^0{10}$/.test(account10);
      const hasZeroBank = !isCcpOrRipPrefix && ribRaw.slice(0, 3) === '000';

      if (rNonZero && (hasZeroAccount || hasZeroBank)) {
        pushAnomaly(
          rNonZero,
          lineNumber,
          recordId,
          hasZeroBank ? 'Code banque' : 'Numéro de compte',
          hasZeroBank ? ribRaw.slice(0, 3) : account10,
          hasZeroBank ? 'Code banque valide différent de 000' : 'Compte non nul',
          hasZeroBank
            ? 'Le code banque (000) est invalide pour un RIB bancaire.'
            : 'Le numéro de compte sur 10 chiffres est entièrement nul.',
          'Corrigez les chiffres du compte bancaire.',
          rec
        );
      } else if (rKey && profile.detailKeyAlgorithm !== 'none') {
        if (isCcpOrRipPrefix) {
          const keyRes = verifyAccountKey(accountPrefix8, account10, key2, 'ccp-or-rip');
          if (!keyRes.valid) {
            pushAnomaly(
              rKey,
              lineNumber,
              recordId,
              'Clé CCP / RIP',
              key2,
              `Clé attendue : ${keyRes.expectedKey}`,
              `Clé invalide pour le compte CCP ${account10.replace(/^0+/, '') || '0'} (« ${key2} » au lieu de « ${keyRes.expectedKey} »).`,
              `Valeurs valides pour ce compte CCP : ${keyRes.expectedKey}.`,
              rec
            );
          }
        } else if (bankValidation && !bankValidation.valid) {
          const bankInfo = findAlgerianBankByCode(bankValidation.bankCode);
          const bankLabel = bankInfo ? `${bankValidation.bankCode} (${bankInfo.shortName})` : bankValidation.bankCode;
          pushAnomaly(
            rKey,
            lineNumber,
            recordId,
            'Clé RIB Bancaire (Mod 97)',
            bankValidation.actualKey,
            `Clé calculée : ${bankValidation.expectedKey}`,
            `Clé RIB invalide pour la banque ${bankLabel} : « ${bankValidation.actualKey} » détectée au lieu de « ${bankValidation.expectedKey} ».`,
            `Corrigez la clé RIB bancaire à ${bankValidation.expectedKey}.`,
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
        'Montant strictement positif',
        `Montant invalide ou nul (« ${amountStr || '(vide)'} »).`,
        'Saisissez un montant numérique positif.',
        rec
      );
    }

    if (rName) {
      if (!nameStr) {
        pushAnomaly(
          rName,
          lineNumber,
          recordId,
          'Colonne Bénéficiaire',
          '(vide)',
          'Nom et prénom obligatoires',
          'Nom du bénéficiaire manquant.',
          'Renseignez le nom et prénom du bénéficiaire.',
          rec
        );
      } else {
        const check = isNameValid(nameStr, profile.allowArabicNames, profile.allowAccentedNames);
        if (!check.ok) {
          pushAnomaly(
            rName,
            lineNumber,
            recordId,
            'Colonne Bénéficiaire',
            nameStr,
            profile.allowAccentedNames
              ? 'Lettres, espaces, tirets ou apostrophes uniquement'
              : 'Lettres ASCII sans accents ni caractères spéciaux',
            `Caractère(s) non autorisé(s) détecté(s) dans le nom du bénéficiaire : ${check.badChars.join(', ')}.`,
            'Supprimez les caractères spéciaux ou accents conformément aux règles du profil.',
            rec
          );
        }
      }
    }

    if (rDup) {
      if (seenRow.has(rawLine)) {
        repeatedLines++;
        pushAnomaly(
          rDup,
          lineNumber,
          recordId,
          'Ligne entière',
          `Identique à la ligne ${seenRow.get(rawLine)}`,
          'Ligne unique',
          `Ligne strictement répétée (identique à la ligne ${seenRow.get(rawLine)}).`,
          'Supprimez le doublon si non intentionnel.',
          rec
        );
      } else {
        seenRow.set(rawLine, lineNumber);
      }
      if (isAccountDigits) {
        if (seenRib.has(ribRaw)) {
          duplicateAccounts++;
          pushAnomaly(
            rDup,
            lineNumber,
            recordId,
            'RIB Bancaire',
            ribRaw,
            'RIB unique',
            `Doublon de RIB bancaire (déjà présent à la ligne ${seenRib.get(ribRaw)}).`,
            'Vérifiez les virements multiples.',
            rec
          );
        } else {
          seenRib.set(ribRaw, lineNumber);
        }
      }
    }

    records.push(rec);
  }

  if (notEmptyRule && processedDataRows === 0) {
    pushAnomaly(
      notEmptyRule,
      1,
      'Fichier',
      'Lignes bénéficiaires',
      '0 bénéficiaire',
      'Au moins 1 enregistrement bénéficiaire',
      'Le fichier tabulaire ne contient aucune ligne de données exploitable.',
      'Ajoutez au moins un bénéficiaire dans le fichier.'
    );
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
