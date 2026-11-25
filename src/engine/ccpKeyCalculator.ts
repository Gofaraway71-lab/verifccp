import {
  computeBankRibKey,
  computeCcpKey,
  computeRipKeyOffset85,
  computeRipKeyStandardMod97,
  findAlgerianBankByCode,
  maskAccountNumber,
} from './cryptoKeys';

export type AccountKeyFormat = 'rip' | 'non-rip' | 'bank-rib';

/**
 * Politique de vérification des clés :
 * - 'algerie-poste' : accepte la Clé RIP (Mod 97 + 85) et la Clé CCP (poids 4..13 mod 100),
 *   conformément aux fichiers réels Algérie Poste (ex. 00799999000000504055 -> Clé CCP 55 valide,
 *   00799999000939675969 -> Clé RIP 69 valide), tout en rejetant toute clé erronée.
 * - 'strict' : impose exclusivement la Clé RIP sur 00799999 et la Clé CCP sur 00000000.
 */
export type KeyValidationPolicy = 'algerie-poste' | 'strict';

export const RIP_PREFIX = '00799999';
export const NON_RIP_PREFIX = '00000000';
export const CCP_KEY_WEIGHTS = [13, 12, 11, 10, 9, 8, 7, 6, 5, 4] as const;

export type InputSourceKind =
  | 'ccp-short'
  | 'ccp-with-key'
  | 'rip-20'
  | 'nonrip-20'
  | 'bank-rib-20'
  | 'line-62-rip'
  | 'line-62-nonrip'
  | 'line-62-bank-rib';

export interface ParsedAccountInput {
  valid: boolean;
  ccpRaw: string;
  ccp10: string;
  extractedKey?: string;
  bankCode?: string;
  agencyCode?: string;
  sourceKind?: InputSourceKind;
  detectedFormat?: AccountKeyFormat;
  error?: string;
}

export interface CcpWeightedBreakdown {
  digits: number[];
  weights: readonly number[];
  products: number[];
  weightedSum: number;
  modulo100: number;
}

export interface RipMod97Breakdown {
  stepX: number;
  stepR: number;
  finalKey: number;
}

export interface BankRibBreakdown {
  bankCode: string;
  bankShortName: string;
  bankName: string;
  agencyCode: string;
  account10: string;
  base18: string;
  stepRemMod97: number;
  keyMod97: string;
  fullRib20: string;
  isAlgeriaPoste: boolean;
  ccpKeyIfPoste?: string;
  ripKeyIfPoste?: string;
}

export interface KeyCalculationDetails {
  format: AccountKeyFormat;
  ccpRaw: string;
  ccp10: string;
  ccpKey: string;
  ripKey: string;
  ripKeyStandardMod97: string;
  expectedKeyForFormat: string;
  expectedKeyLabel: 'Clé RIP' | 'Clé CCP' | 'Clé RIB';
  prefixForFormat: string;
  fullRip20: string;
  fullNonRip20: string;
  formattedBlockForFormat: string;
  ccpBreakdown: CcpWeightedBreakdown;
  ripBreakdown: RipMod97Breakdown;
  bankRib?: BankRibBreakdown;
}

export type KeyComplianceStatus =
  | 'no-key'
  | 'incomplete-key'
  | 'conforme'
  | 'cross-format-ccp-on-rip'
  | 'cross-format-rip-on-nonrip'
  | 'invalid-key';

export interface KeyComplianceResult {
  status: KeyComplianceStatus;
  isCompliant: boolean;
  format: AccountKeyFormat;
  matchedKind?: 'Clé RIP' | 'Clé CCP' | 'Clé RIP & CCP' | 'Clé RIB';
  providedKey: string;
  expectedKey: string;
  expectedKeyLabel: 'Clé RIP' | 'Clé CCP' | 'Clé RIB';
  title: string;
  message: string;
  correctedBlock20?: string;
}

export interface BankContextOptions {
  bankCode?: string;
  agencyCode?: string;
}

export interface SingleAccountEvaluation {
  parsed: ParsedAccountInput;
  effectiveFormat: AccountKeyFormat;
  calculation: KeyCalculationDetails | null;
  effectiveKeyToVerify: string;
  compliance: KeyComplianceResult | null;
}

export interface BatchKeyRow {
  lineNumber: number;
  inputRaw: string;
  valid: boolean;
  error?: string;
  format: AccountKeyFormat;
  formatAutoDetected: boolean;
  bankCode?: string;
  bankLabel?: string;
  agencyCode?: string;
  ccpShort: string;
  ccp10: string;
  ccpKey: string;
  ripKey: string;
  bankRibKey?: string;
  expectedKey: string;
  formatted20: string;
  providedKey?: string;
  complianceStatus: KeyComplianceStatus;
  complianceLabel: string;
}

export interface BatchKeySummary {
  total: number;
  validInputs: number;
  invalidInputs: number;
  checkedCount: number;
  compliantCount: number;
  nonCompliantCount: number;
  crossFormatCount: number;
}

/**
 * Analyse une saisie utilisateur de compte CCP/RIP/RIB bancaire :
 * - Numéro de compte simple (1 à 10 chiffres, ex. "300076" ou "5040")
 * - Compte + clé avec séparateur (ex. "5040/55", "300076-86", "300076;86")
 * - Bloc complet de 20 chiffres RIP ("00799999..."), non-RIP ("00000000...") ou RIB bancaire ("001...", "002...", etc.)
 * - Ligne complète de fichier débutant par "*" (ex. "*00799999000000504055...")
 */
export function parseAccountKeyInput(rawInput: string): ParsedAccountInput {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { valid: false, ccpRaw: '', ccp10: '' };
  }

  // Cas 1 : Ligne complète de fichier commençant par "*"
  if (trimmed.startsWith('*') && trimmed.length >= 21) {
    const block20 = trimmed.slice(1, 21);
    if (/^\d{20}$/.test(block20)) {
      const prefix8 = block20.slice(0, 8);
      const bankCode = block20.slice(0, 3);
      const agencyCode = block20.slice(3, 8);
      const ccp10 = block20.slice(8, 18);
      const key2 = block20.slice(18, 20);

      if (prefix8 === RIP_PREFIX || prefix8 === NON_RIP_PREFIX) {
        if (/^0{10}$/.test(ccp10)) {
          return {
            valid: false,
            ccpRaw: ccp10,
            ccp10,
            error: 'Le numéro de compte CCP extrait de la ligne ne peut pas être nul.',
          };
        }
        const isRip = prefix8 === RIP_PREFIX;
        return {
          valid: true,
          ccpRaw: ccp10.replace(/^0+/, '') || '0',
          ccp10,
          extractedKey: key2,
          sourceKind: isRip ? 'line-62-rip' : 'line-62-nonrip',
          detectedFormat: isRip ? 'rip' : 'non-rip',
        };
      }

      if (bankCode !== '000') {
        if (/^0{10}$/.test(ccp10)) {
          return {
            valid: false,
            ccpRaw: ccp10,
            ccp10,
            error: 'Le numéro de compte bancaire extrait de la ligne ne peut pas être nul.',
          };
        }
        return {
          valid: true,
          ccpRaw: ccp10.replace(/^0+/, '') || '0',
          ccp10,
          extractedKey: key2,
          bankCode,
          agencyCode,
          sourceKind: 'line-62-bank-rib',
          detectedFormat: 'bank-rib',
        };
      }

      return {
        valid: false,
        ccpRaw: block20,
        ccp10: '',
        error: `Préfixe de ligne « ${prefix8} » non reconnu. Attendu : ${RIP_PREFIX} (RIP), ${NON_RIP_PREFIX} (non-RIP) ou code banque sur 3 chiffres (ex. 001–038).`,
      };
    }
  }

  // Cas 2 : Paire "compte/clé", "compte-clé", "compte;clé", "compte clé"
  const pairMatch = trimmed.match(/^(\d{1,10})\s*[/\-;,\s:]+\s*(\d{1,2})$/);
  if (pairMatch) {
    const ccpDigits = pairMatch[1];
    const keyDigits = pairMatch[2].padStart(2, '0');
    const ccp10 = ccpDigits.padStart(10, '0');
    if (/^0{10}$/.test(ccp10)) {
      return {
        valid: false,
        ccpRaw: ccpDigits,
        ccp10,
        error: 'Le numéro de compte doit être strictement supérieur à zéro.',
      };
    }
    return {
      valid: true,
      ccpRaw: ccpDigits.replace(/^0+/, '') || '0',
      ccp10,
      extractedKey: keyDigits,
      sourceKind: 'ccp-with-key',
    };
  }

  const digits = trimmed.replace(/\D/g, '');
  if (!digits) {
    return {
      valid: false,
      ccpRaw: '',
      ccp10: '',
      error: 'Saisissez uniquement des chiffres (numéro de compte, paire compte/clé ou bloc 20 chiffres).',
    };
  }

  // Cas 3 : Bloc complet de 20 chiffres (RIP, non-RIP ou RIB bancaire)
  if (digits.length === 20) {
    const prefix8 = digits.slice(0, 8);
    const bankCode = digits.slice(0, 3);
    const agencyCode = digits.slice(3, 8);
    const ccp10 = digits.slice(8, 18);
    const key2 = digits.slice(18, 20);

    if (prefix8 === RIP_PREFIX || prefix8 === NON_RIP_PREFIX) {
      if (/^0{10}$/.test(ccp10)) {
        return {
          valid: false,
          ccpRaw: ccp10,
          ccp10,
          error: 'Le numéro de compte CCP ne peut pas être nul.',
        };
      }
      const isRip = prefix8 === RIP_PREFIX;
      return {
        valid: true,
        ccpRaw: ccp10.replace(/^0+/, '') || '0',
        ccp10,
        extractedKey: key2,
        sourceKind: isRip ? 'rip-20' : 'nonrip-20',
        detectedFormat: isRip ? 'rip' : 'non-rip',
      };
    }

    if (bankCode !== '000') {
      if (/^0{10}$/.test(ccp10)) {
        return {
          valid: false,
          ccpRaw: ccp10,
          ccp10,
          error: 'Le numéro de compte bancaire ne peut pas être nul.',
        };
      }
      return {
        valid: true,
        ccpRaw: ccp10.replace(/^0+/, '') || '0',
        ccp10,
        extractedKey: key2,
        bankCode,
        agencyCode,
        sourceKind: 'bank-rib-20',
        detectedFormat: 'bank-rib',
      };
    }

    return {
      valid: false,
      ccpRaw: digits,
      ccp10: '',
      error: `Bloc de 20 chiffres au préfixe « ${prefix8} » non reconnu. Attendu : ${RIP_PREFIX} (RIP), ${NON_RIP_PREFIX} (non-RIP) ou un code banque valide (ex. 001–038).`,
    };
  }

  // Cas 4 : Numéro de compte simple (1 à 10 chiffres)
  if (digits.length > 10) {
    return {
      valid: false,
      ccpRaw: digits,
      ccp10: '',
      error:
        'Un numéro de compte comporte au maximum 10 chiffres (ou saisissez un bloc complet RIB/RIP de 20 chiffres).',
    };
  }

  const ccp10 = digits.padStart(10, '0');
  if (/^0{10}$/.test(ccp10)) {
    return {
      valid: false,
      ccpRaw: digits,
      ccp10,
      error: 'Le numéro de compte doit être strictement supérieur à zéro.',
    };
  }

  return {
    valid: true,
    ccpRaw: digits.replace(/^0+/, '') || '0',
    ccp10,
    sourceKind: 'ccp-short',
  };
}

/**
 * Détermine le format effectif à appliquer : priorité au préfixe explicite (00799999 / 00000000 / RIB bancaire 20 ch.),
 * sinon le format sélectionné par l'utilisateur.
 */
export function resolveEffectiveFormat(
  parsed: ParsedAccountInput,
  selectedFormat: AccountKeyFormat
): AccountKeyFormat {
  return parsed.detectedFormat ?? selectedFormat;
}

/**
 * Calcule les clés CCP, RIP et RIB bancaire ainsi que le détail mathématique complet pour un compte (10 chiffres).
 */
export function calculateKeysForAccount(
  ccp10Raw: string,
  format: AccountKeyFormat,
  bankContext?: BankContextOptions
): KeyCalculationDetails | null {
  const clean = ccp10Raw.replace(/\D/g, '');
  if (!clean || clean.length > 10) return null;
  const ccp10 = clean.padStart(10, '0');
  if (/^0{10}$/.test(ccp10)) return null;

  const ccpKey = computeCcpKey(ccp10);
  const ripKey = computeRipKeyOffset85(ccp10);
  const ripKeyStandardMod97 = computeRipKeyStandardMod97(RIP_PREFIX, ccp10);

  if (!ccpKey || !ripKey || !ripKeyStandardMod97) return null;

  const digits = ccp10.split('').map(Number);
  const products = digits.map((d, idx) => d * CCP_KEY_WEIGHTS[idx]);
  const weightedSum = products.reduce((acc, val) => acc + val, 0);

  const numBig = BigInt(ccp10);
  const stepX = Number((numBig * 100n) % 97n);
  const stepR = (stepX + 85) % 97;
  const finalKey = stepR === 0 ? 97 : 97 - stepR;

  const fullRip20 = `${RIP_PREFIX}${ccp10}${ripKey}`;
  const fullNonRip20 = `${NON_RIP_PREFIX}${ccp10}${ccpKey}`;

  if (format === 'bank-rib') {
    const bankDigits = (bankContext?.bankCode ?? '001').replace(/\D/g, '');
    const bankCode = (bankDigits || '001').padStart(3, '0').slice(-3);
    const defaultAgency = bankCode === '007' ? '99999' : '00001';
    const agencyDigits = (bankContext?.agencyCode ?? '').replace(/\D/g, '');
    const agencyCode = (agencyDigits || defaultAgency).padStart(5, '0').slice(-5);

    const keyMod97 = computeBankRibKey(bankCode, agencyCode, ccp10);
    if (!keyMod97) return null;

    const base18 = `${bankCode}${agencyCode}${ccp10}`;
    const stepRemMod97 = Number((BigInt(base18) * 100n) % 97n);
    const fullRib20 = `${base18}${keyMod97}`;
    const bankInfo = findAlgerianBankByCode(bankCode);
    const bankShortName = bankInfo?.shortName ?? `Banque ${bankCode}`;
    const bankName = bankInfo?.name ?? `Établissement bancaire code ${bankCode}`;
    const isAlgeriaPoste = bankCode === '007';

    return {
      format,
      ccpRaw: ccp10.replace(/^0+/, '') || '0',
      ccp10,
      ccpKey,
      ripKey,
      ripKeyStandardMod97,
      expectedKeyForFormat: keyMod97,
      expectedKeyLabel: 'Clé RIB',
      prefixForFormat: `${bankCode}${agencyCode}`,
      fullRip20,
      fullNonRip20,
      formattedBlockForFormat: fullRib20,
      ccpBreakdown: {
        digits,
        weights: CCP_KEY_WEIGHTS,
        products,
        weightedSum,
        modulo100: weightedSum % 100,
      },
      ripBreakdown: {
        stepX,
        stepR,
        finalKey,
      },
      bankRib: {
        bankCode,
        bankShortName,
        bankName,
        agencyCode,
        account10: ccp10,
        base18,
        stepRemMod97,
        keyMod97,
        fullRib20,
        isAlgeriaPoste,
        ccpKeyIfPoste: isAlgeriaPoste ? ccpKey : undefined,
        ripKeyIfPoste: isAlgeriaPoste ? ripKey : undefined,
      },
    };
  }

  const isRip = format === 'rip';

  return {
    format,
    ccpRaw: ccp10.replace(/^0+/, '') || '0',
    ccp10,
    ccpKey,
    ripKey,
    ripKeyStandardMod97,
    expectedKeyForFormat: isRip ? ripKey : ccpKey,
    expectedKeyLabel: isRip ? 'Clé RIP' : 'Clé CCP',
    prefixForFormat: isRip ? RIP_PREFIX : NON_RIP_PREFIX,
    fullRip20,
    fullNonRip20,
    formattedBlockForFormat: isRip ? fullRip20 : fullNonRip20,
    ccpBreakdown: {
      digits,
      weights: CCP_KEY_WEIGHTS,
      products,
      weightedSum,
      modulo100: weightedSum % 100,
    },
    ripBreakdown: {
      stepX,
      stepR,
      finalKey,
    },
  };
}

/**
 * Vérifie la conformité d'une clé fournie par rapport au compte, à la banque et à la politique choisie :
 * - Pour RIB Bancaire (001–038 hors 007) : Modulo 97 Banque d'Algérie (`RIB20 mod 97 = 0`).
 * - Pour Algérie Poste ('algerie-poste') : accepte la Clé CCP et la Clé RIP, rejette toute clé invalide.
 * - Pour 'strict' : exige la Clé RIP uniquement sur format RIP et la Clé CCP uniquement sur format non-RIP.
 */
export function verifyKeyCompliance(
  calc: KeyCalculationDetails,
  providedKeyRaw: string,
  policy: KeyValidationPolicy = 'algerie-poste'
): KeyComplianceResult {
  const digits = providedKeyRaw.replace(/\D/g, '').slice(0, 2);
  const expectedKey = calc.expectedKeyForFormat;
  const expectedKeyLabel = calc.expectedKeyLabel;

  if (!digits) {
    const message =
      calc.format === 'bank-rib' && calc.bankRib
        ? `Clé RIB calculée (${calc.bankRib.bankShortName} ${calc.bankRib.bankCode}) : « ${calc.bankRib.keyMod97} » (Mod 97).`
        : `Clés calculées pour ce compte : Clé CCP « ${calc.ccpKey} » · Clé RIP « ${calc.ripKey} ».`;

    return {
      status: 'no-key',
      isCompliant: false,
      format: calc.format,
      providedKey: '',
      expectedKey,
      expectedKeyLabel,
      title: 'Aucune clé à contrôler',
      message,
    };
  }

  if (digits.length < 2) {
    return {
      status: 'incomplete-key',
      isCompliant: false,
      format: calc.format,
      providedKey: digits,
      expectedKey,
      expectedKeyLabel,
      title: 'Clé incomplète',
      message: 'Saisissez 2 chiffres pour vérifier la conformité de la clé.',
    };
  }

  // Cas RIB Bancaire / Trésor Public
  if (calc.format === 'bank-rib' && calc.bankRib) {
    const bank = calc.bankRib;

    // Cas particulier si code banque 007 (Algérie Poste) saisi dans le sélecteur bancaire
    if (bank.isAlgeriaPoste && bank.agencyCode === '99999') {
      if (digits === calc.ripKey) {
        return {
          status: 'conforme',
          isCompliant: true,
          format: 'bank-rib',
          matchedKind: 'Clé RIP',
          providedKey: digits,
          expectedKey: calc.ripKey,
          expectedKeyLabel: 'Clé RIP',
          title: 'Conforme — Clé RIP Algérie Poste (007)',
          message: `Clé RIP « ${digits} » valide (Mod 97 + 85). Référence Clé CCP : « ${calc.ccpKey} » · Mod 97 standard : « ${bank.keyMod97} ».`,
        };
      }
      if (digits === calc.ccpKey) {
        if (policy === 'algerie-poste') {
          return {
            status: 'conforme',
            isCompliant: true,
            format: 'bank-rib',
            matchedKind: 'Clé CCP',
            providedKey: digits,
            expectedKey: calc.ccpKey,
            expectedKeyLabel: 'Clé CCP',
            title: 'Conforme — Clé CCP Algérie Poste (007)',
            message: `Clé CCP « ${digits} » conforme pour Algérie Poste (Clé RIP Mod 97+85 : « ${calc.ripKey} »).`,
          };
        }
        return {
          status: 'cross-format-ccp-on-rip',
          isCompliant: false,
          format: 'bank-rib',
          providedKey: digits,
          expectedKey: calc.ripKey,
          expectedKeyLabel: 'Clé RIP',
          title: 'Mode strict — Clé CCP détectée sur préfixe 00799999',
          message: `« ${digits} » est la Clé CCP du compte, mais le format RIP (00799999) attend la Clé RIP « ${calc.ripKey} » en mode strict.`,
          correctedBlock20: calc.fullRip20,
        };
      }
    }

    if (digits === bank.keyMod97) {
      return {
        status: 'conforme',
        isCompliant: true,
        format: 'bank-rib',
        matchedKind: 'Clé RIB',
        providedKey: digits,
        expectedKey: bank.keyMod97,
        expectedKeyLabel: 'Clé RIB',
        title: `Conforme — Clé RIB ${bank.bankShortName} (${bank.bankCode})`,
        message: `Clé RIB « ${digits} » valide pour ${bank.bankName} (agence ${bank.agencyCode}) — preuve mathématique : RIB20 mod 97 = 0.`,
      };
    }

    return {
      status: 'invalid-key',
      isCompliant: false,
      format: 'bank-rib',
      providedKey: digits,
      expectedKey: bank.keyMod97,
      expectedKeyLabel: 'Clé RIB',
      title: `Non conforme — Clé RIB invalide (${bank.bankShortName})`,
      message: `Clé « ${digits} » invalide pour ${bank.bankName} (${bank.bankCode} / agence ${bank.agencyCode}). Clé RIB Mod 97 attendue : « ${bank.keyMod97} ».`,
      correctedBlock20: bank.fullRib20,
    };
  }

  const isRip = calc.format === 'rip';
  const matchesRip = digits === calc.ripKey;
  const matchesCcp = digits === calc.ccpKey;

  // Politique Algérie Poste standard (accepte Clé RIP et Clé CCP)
  if (policy === 'algerie-poste') {
    if (matchesRip && matchesCcp) {
      return {
        status: 'conforme',
        isCompliant: true,
        format: calc.format,
        matchedKind: 'Clé RIP & CCP',
        providedKey: digits,
        expectedKey: digits,
        expectedKeyLabel,
        title: `Conforme — Format ${isRip ? 'RIP' : 'non-RIP'}`,
        message: `Clé « ${digits} » conforme (correspond à la fois à la Clé RIP et à la Clé CCP).`,
      };
    }

    if (matchesRip) {
      return {
        status: 'conforme',
        isCompliant: true,
        format: calc.format,
        matchedKind: 'Clé RIP',
        providedKey: digits,
        expectedKey: calc.ripKey,
        expectedKeyLabel: 'Clé RIP',
        title: `Conforme — Clé RIP valide (${isRip ? 'RIP' : 'non-RIP'})`,
        message: `Clé RIP « ${digits} » conforme pour le compte ${calc.ccpRaw} (référence Clé CCP : « ${calc.ccpKey} »).`,
      };
    }

    if (matchesCcp) {
      return {
        status: 'conforme',
        isCompliant: true,
        format: calc.format,
        matchedKind: 'Clé CCP',
        providedKey: digits,
        expectedKey: calc.ccpKey,
        expectedKeyLabel: 'Clé CCP',
        title: `Conforme — Clé CCP valide (${isRip ? 'RIP' : 'non-RIP'})`,
        message: `Clé CCP « ${digits} » conforme pour le compte ${calc.ccpRaw} (référence Clé RIP Mod 97+85 : « ${calc.ripKey} »).`,
      };
    }

    return {
      status: 'invalid-key',
      isCompliant: false,
      format: calc.format,
      providedKey: digits,
      expectedKey: `${calc.ripKey} (RIP) ou ${calc.ccpKey} (CCP)`,
      expectedKeyLabel,
      title: 'Non conforme — Clé invalide',
      message: `Clé « ${digits} » invalide pour le compte ${calc.ccpRaw}. Valeurs valides : Clé CCP « ${calc.ccpKey} » ou Clé RIP « ${calc.ripKey} ».`,
      correctedBlock20: calc.formattedBlockForFormat,
    };
  }

  // Politique stricte par format (RIP -> Clé RIP uniquement ; non-RIP -> Clé CCP uniquement)
  if (isRip) {
    if (matchesRip) {
      return {
        status: 'conforme',
        isCompliant: true,
        format: 'rip',
        matchedKind: 'Clé RIP',
        providedKey: digits,
        expectedKey: calc.ripKey,
        expectedKeyLabel: 'Clé RIP',
        title: 'Conforme — Format RIP (mode strict)',
        message: `Clé RIP « ${digits} » conforme pour le compte RIP (préfixe ${RIP_PREFIX}).`,
      };
    }

    if (matchesCcp) {
      return {
        status: 'cross-format-ccp-on-rip',
        isCompliant: false,
        format: 'rip',
        providedKey: digits,
        expectedKey: calc.ripKey,
        expectedKeyLabel: 'Clé RIP',
        title: 'Mode strict — Clé CCP détectée sur un compte RIP',
        message: `« ${digits} » est la Clé CCP valide du compte ${calc.ccpRaw}, mais en mode strict le préfixe RIP (${RIP_PREFIX}) exige la Clé RIP « ${calc.ripKey} ».`,
        correctedBlock20: calc.fullRip20,
      };
    }

    return {
      status: 'invalid-key',
      isCompliant: false,
      format: 'rip',
      providedKey: digits,
      expectedKey: calc.ripKey,
      expectedKeyLabel: 'Clé RIP',
      title: 'Non conforme — Clé RIP invalide',
      message: `Clé « ${digits} » invalide pour le format RIP (${RIP_PREFIX}). Clé RIP attendue : « ${calc.ripKey} ».`,
      correctedBlock20: calc.fullRip20,
    };
  }

  if (matchesCcp) {
    return {
      status: 'conforme',
      isCompliant: true,
      format: 'non-rip',
      matchedKind: 'Clé CCP',
      providedKey: digits,
      expectedKey: calc.ccpKey,
      expectedKeyLabel: 'Clé CCP',
      title: 'Conforme — Format non-RIP (mode strict)',
      message: `Clé CCP « ${digits} » conforme pour le compte non-RIP (préfixe ${NON_RIP_PREFIX}).`,
    };
  }

  if (matchesRip) {
    return {
      status: 'cross-format-rip-on-nonrip',
      isCompliant: false,
      format: 'non-rip',
      providedKey: digits,
      expectedKey: calc.ccpKey,
      expectedKeyLabel: 'Clé CCP',
      title: 'Mode strict — Clé RIP détectée sur un compte non-RIP',
      message: `« ${digits} » est la Clé RIP valide du compte ${calc.ccpRaw}, mais en mode strict le préfixe non-RIP (${NON_RIP_PREFIX}) exige la Clé CCP « ${calc.ccpKey} ».`,
      correctedBlock20: calc.fullNonRip20,
    };
  }

  return {
    status: 'invalid-key',
    isCompliant: false,
    format: 'non-rip',
    providedKey: digits,
    expectedKey: calc.ccpKey,
    expectedKeyLabel: 'Clé CCP',
    title: 'Non conforme — Clé CCP invalide',
    message: `Clé « ${digits} » invalide pour le format non-RIP (${NON_RIP_PREFIX}). Clé CCP attendue : « ${calc.ccpKey} ».`,
    correctedBlock20: calc.fullNonRip20,
  };
}

/**
 * Évalue une saisie unitaire complète (parsing + résolution du format + calcul + vérification de conformité).
 */
export function evaluateAccountCompliance(
  rawInput: string,
  selectedFormat: AccountKeyFormat,
  manualKeyOverride = '',
  policy: KeyValidationPolicy = 'algerie-poste',
  bankContext?: BankContextOptions
): SingleAccountEvaluation {
  const parsed = parseAccountKeyInput(rawInput);
  const effectiveFormat = resolveEffectiveFormat(parsed, selectedFormat);

  const manualDigits = manualKeyOverride.replace(/\D/g, '').slice(0, 2);
  const effectiveKeyToVerify = manualDigits.length > 0 ? manualDigits : parsed.extractedKey ?? '';

  if (!parsed.valid) {
    return {
      parsed,
      effectiveFormat,
      calculation: null,
      effectiveKeyToVerify,
      compliance: null,
    };
  }

  const effectiveBankContext: BankContextOptions | undefined =
    effectiveFormat === 'bank-rib'
      ? {
          bankCode: parsed.bankCode ?? bankContext?.bankCode,
          agencyCode: parsed.agencyCode ?? bankContext?.agencyCode,
        }
      : undefined;

  const calculation = calculateKeysForAccount(parsed.ccp10, effectiveFormat, effectiveBankContext);
  if (!calculation) {
    return {
      parsed,
      effectiveFormat,
      calculation: null,
      effectiveKeyToVerify,
      compliance: null,
    };
  }

  const compliance =
    effectiveKeyToVerify.length > 0
      ? verifyKeyCompliance(calculation, effectiveKeyToVerify, policy)
      : null;

  return {
    parsed,
    effectiveFormat,
    calculation,
    effectiveKeyToVerify,
    compliance,
  };
}

/**
 * Évalue un lot multi-lignes de comptes CCP, RIP ou RIB bancaires :
 * - blocs 20 chiffres (`00799999...`, `00000000...`, `001...`, `002...`, etc.)
 * - lignes 62 car. débutant par `*`
 * - paires `compte;clé` ou `banque;agence;compte[;clé]`
 * - numéros de compte simples
 */
export function evaluateBatchAccounts(
  batchText: string,
  defaultFormat: AccountKeyFormat,
  policy: KeyValidationPolicy = 'algerie-poste',
  bankContext?: BankContextOptions
): { rows: BatchKeyRow[]; summary: BatchKeySummary } {
  const lines = batchText.split(/\r?\n/);
  const rows: BatchKeyRow[] = [];

  lines.forEach((rawLine, idx) => {
    const trimmed = rawLine.trim();
    if (!trimmed) return;

    const isFixedFileLine = trimmed.startsWith('*') && trimmed.length >= 21;
    let parsed: ParsedAccountInput;
    let secondToken: string | undefined;
    let explicitBankContext: BankContextOptions | undefined;

    if (isFixedFileLine) {
      parsed = parseAccountKeyInput(trimmed);
    } else {
      const parts = trimmed.split(/[;,\t\s]+/).filter(Boolean);
      const firstToken = parts[0] ?? '';
      // Cas "banque;agence;compte" ou "banque;agence;compte;clé"
      if (
        parts.length >= 3 &&
        /^\d{1,3}$/.test(parts[0]) &&
        /^\d{1,5}$/.test(parts[1]) &&
        /^\d{1,10}$/.test(parts[2])
      ) {
        const bCode = parts[0].padStart(3, '0');
        const aCode = parts[1].padStart(5, '0');
        const accParsed = parseAccountKeyInput(parts[2]);
        parsed = accParsed.valid
          ? {
              ...accParsed,
              bankCode: bCode,
              agencyCode: aCode,
              detectedFormat: bCode === '007' && aCode === '99999' ? 'rip' : 'bank-rib',
            }
          : accParsed;
        explicitBankContext = { bankCode: bCode, agencyCode: aCode };
        secondToken = parts[3]?.replace(/\D/g, '');
      } else {
        secondToken = parts[1]?.replace(/\D/g, '');
        parsed = parseAccountKeyInput(parts.length === 2 && firstToken.length <= 10 ? trimmed : firstToken);
      }
    }

    const rowFormat = resolveEffectiveFormat(parsed, defaultFormat);
    const formatAutoDetected = Boolean(parsed.detectedFormat);

    if (!parsed.valid) {
      rows.push({
        lineNumber: idx + 1,
        inputRaw: trimmed,
        valid: false,
        error: parsed.error ?? 'Format de compte invalide',
        format: rowFormat,
        formatAutoDetected,
        ccpShort: '—',
        ccp10: '—',
        ccpKey: '—',
        ripKey: '—',
        expectedKey: '—',
        formatted20: '—',
        complianceStatus: 'invalid-key',
        complianceLabel: parsed.error ?? 'Format invalide',
      });
      return;
    }

    const rowBankContext: BankContextOptions | undefined =
      rowFormat === 'bank-rib'
        ? {
            bankCode: explicitBankContext?.bankCode ?? parsed.bankCode ?? bankContext?.bankCode,
            agencyCode: explicitBankContext?.agencyCode ?? parsed.agencyCode ?? bankContext?.agencyCode,
          }
        : undefined;

    const calc = calculateKeysForAccount(parsed.ccp10, rowFormat, rowBankContext);
    if (!calc) {
      rows.push({
        lineNumber: idx + 1,
        inputRaw: trimmed,
        valid: false,
        error: 'Impossible de calculer la clé pour ce compte.',
        format: rowFormat,
        formatAutoDetected,
        ccpShort: parsed.ccpRaw,
        ccp10: parsed.ccp10,
        ccpKey: '—',
        ripKey: '—',
        expectedKey: '—',
        formatted20: '—',
        complianceStatus: 'invalid-key',
        complianceLabel: 'Calcul impossible',
      });
      return;
    }

    const providedKey =
      parsed.extractedKey ??
      (secondToken && secondToken.length <= 2 ? secondToken.padStart(2, '0') : undefined);

    const compliance = providedKey ? verifyKeyCompliance(calc, providedKey, policy) : null;

    let complianceStatus: KeyComplianceStatus = 'no-key';
    let complianceLabel = 'Calculé';
    if (compliance) {
      complianceStatus = compliance.status;
      if (compliance.status === 'conforme') {
        complianceLabel = `${compliance.matchedKind ?? calc.expectedKeyLabel} valide (${providedKey})`;
      } else if (compliance.status === 'cross-format-ccp-on-rip') {
        complianceLabel = `Mode strict : Clé CCP (${providedKey}) sur RIP · Clé RIP ${calc.ripKey}`;
      } else if (compliance.status === 'cross-format-rip-on-nonrip') {
        complianceLabel = `Mode strict : Clé RIP (${providedKey}) sur non-RIP · Clé CCP ${calc.ccpKey}`;
      } else if (calc.format === 'bank-rib' && calc.bankRib) {
        complianceLabel = `Clé ${providedKey} invalide (RIB attendu : ${calc.bankRib.keyMod97})`;
      } else {
        complianceLabel = `Clé ${providedKey} invalide (CCP : ${calc.ccpKey} / RIP : ${calc.ripKey})`;
      }
    }

    rows.push({
      lineNumber: idx + 1,
      inputRaw: trimmed,
      valid: true,
      format: rowFormat,
      formatAutoDetected,
      bankCode: calc.bankRib?.bankCode,
      bankLabel: calc.bankRib?.bankShortName,
      agencyCode: calc.bankRib?.agencyCode,
      ccpShort: parsed.ccpRaw,
      ccp10: calc.ccp10,
      ccpKey: calc.ccpKey,
      ripKey: calc.ripKey,
      bankRibKey: calc.bankRib?.keyMod97,
      expectedKey:
        calc.format === 'bank-rib' && calc.bankRib
          ? calc.bankRib.keyMod97
          : policy === 'algerie-poste'
            ? `${calc.ccpKey} / ${calc.ripKey}`
            : calc.expectedKeyForFormat,
      formatted20: calc.formattedBlockForFormat,
      providedKey,
      complianceStatus,
      complianceLabel,
    });
  });

  const summary: BatchKeySummary = {
    total: rows.length,
    validInputs: rows.filter((r) => r.valid).length,
    invalidInputs: rows.filter((r) => !r.valid).length,
    checkedCount: rows.filter((r) => r.valid && Boolean(r.providedKey)).length,
    compliantCount: rows.filter((r) => r.valid && r.complianceStatus === 'conforme').length,
    nonCompliantCount: rows.filter(
      (r) =>
        !r.valid ||
        r.complianceStatus === 'invalid-key' ||
        r.complianceStatus === 'cross-format-ccp-on-rip' ||
        r.complianceStatus === 'cross-format-rip-on-nonrip'
    ).length,
    crossFormatCount: rows.filter(
      (r) =>
        r.complianceStatus === 'cross-format-ccp-on-rip' ||
        r.complianceStatus === 'cross-format-rip-on-nonrip'
    ).length,
  };

  return { rows, summary };
}

/**
 * Construit le contenu CSV UTF-8 BOM pour l'export des résultats par lot.
 */
export function buildBatchKeysCsv(rows: BatchKeyRow[], privacyMode: boolean): string {
  const header = [
    'Ligne',
    'Format / Banque',
    'Agence',
    'Compte (10 chiffres)',
    'Cle CCP',
    'Cle RIP',
    'Cle RIB (Mod 97)',
    'Bloc 20 chiffres',
    'Cle fournie',
    'Statut conformite',
  ];

  const body = rows.map((r) => [
    String(r.lineNumber),
    r.format === 'bank-rib'
      ? `RIB ${r.bankLabel ?? ''} (${r.bankCode ?? '---'})`.trim()
      : r.format === 'rip'
        ? `RIP (${RIP_PREFIX})`
        : `non-RIP (${NON_RIP_PREFIX})`,
    r.agencyCode ?? (r.format === 'rip' ? '99999' : r.format === 'non-rip' ? '00000' : '—'),
    r.valid ? (privacyMode ? maskAccountNumber(r.ccp10, true) : r.ccp10) : r.inputRaw,
    r.format === 'bank-rib' && r.bankCode !== '007' ? '—' : r.ccpKey,
    r.format === 'bank-rib' && r.bankCode !== '007' ? '—' : r.ripKey,
    r.bankRibKey ?? '—',
    r.valid ? maskAccountNumber(r.formatted20, privacyMode) : '',
    r.providedKey ?? '',
    r.complianceLabel,
  ]);

  return '\uFEFF' + [header, ...body].map((row) => row.join(';')).join('\r\n');
}
