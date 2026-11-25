import { KeyAlgorithm } from '../types/ccp';

/**
 * Calcule la clé CCP Algérie Poste (2 chiffres).
 */
export function computeCcpKey(ccpDigits: string): string | null {
  const clean = ccpDigits.replace(/\D/g, '');
  if (!clean || clean.length > 10) return null;
  const padded = clean.padStart(10, '0');
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const digit = Number(padded[9 - i]);
    sum += digit * (i + 4);
  }
  return String(sum % 100).padStart(2, '0');
}

/**
 * Calcule la clé RIP Algérie Poste (2 chiffres) avec décalage 85 (BaridiMob / Algérie Poste).
 */
export function computeRipKeyOffset85(ccpDigits: string): string | null {
  const clean = ccpDigits.replace(/\D/g, '');
  if (!clean || clean.length > 10) return null;
  const num = BigInt(clean);
  const x = (num * 100n) % 97n;
  const r = (x + 85n) % 97n;
  const key = r === 0n ? 97n : 97n - r;
  return String(key).padStart(2, '0');
}

/**
 * Calcule la clé RIB/RIP standard Modulo 97 sur la base de 18 chiffres.
 */
export function computeRipKeyStandardMod97(prefix8: string, ccpDigits: string): string | null {
  const cleanPrefix = prefix8.replace(/\D/g, '');
  const cleanCcp = ccpDigits.replace(/\D/g, '');
  if (cleanPrefix.length !== 8 || !cleanCcp || cleanCcp.length > 10) return null;
  const base18 = `${cleanPrefix}${cleanCcp.padStart(10, '0')}`;
  const rem = (BigInt(base18) * 100n) % 97n;
  const key = 97n - rem;
  return String(key).padStart(2, '0');
}

export interface AlgerianBankInfo {
  code: string;
  shortName: string;
  name: string;
  category: 'public' | 'private' | 'poste' | 'tresor';
  defaultAgency?: string;
}

export const ALGERIAN_BANKS: readonly AlgerianBankInfo[] = [
  { code: '001', shortName: 'BNA', name: "Banque Nationale d'Algérie", category: 'public' },
  { code: '002', shortName: 'BEA', name: "Banque Extérieure d'Algérie", category: 'public' },
  { code: '003', shortName: 'BADR', name: "Banque de l'Agriculture et du Développement Rural", category: 'public' },
  { code: '004', shortName: 'CPA', name: "Crédit Populaire d'Algérie", category: 'public' },
  { code: '005', shortName: 'BDL', name: 'Banque de Développement Local', category: 'public' },
  { code: '006', shortName: 'Al Baraka', name: "Banque Al Baraka d'Algérie", category: 'private' },
  { code: '007', shortName: 'Algérie Poste', name: 'Algérie Poste (CCP / RIP)', category: 'poste', defaultAgency: '99999' },
  { code: '008', shortName: 'Trésor Public', name: 'Trésor Public Algérien', category: 'tresor' },
  { code: '010', shortName: 'CNMA', name: 'Caisse Nationale de Mutualité Agricole', category: 'public' },
  { code: '011', shortName: 'CNEP-Banque', name: "Caisse Nationale d'Épargne et de Prévoyance", category: 'public' },
  { code: '012', shortName: 'Citibank', name: 'Citibank N.A. Algeria', category: 'private' },
  { code: '014', shortName: 'ABC Bank', name: 'Arab Banking Corporation Algeria', category: 'private' },
  { code: '020', shortName: 'Natixis', name: 'Natixis Algérie', category: 'private' },
  { code: '021', shortName: 'Société Générale', name: 'Société Générale Algérie', category: 'private' },
  { code: '026', shortName: 'Arab Bank', name: 'Arab Bank PLC Algeria', category: 'private' },
  { code: '027', shortName: 'BNP Paribas', name: 'BNP Paribas El Djazaïr', category: 'private' },
  { code: '029', shortName: 'Trust Bank', name: 'Trust Bank Algeria', category: 'private' },
  { code: '031', shortName: 'Housing Bank', name: 'The Housing Bank for Trade and Finance Algeria', category: 'private' },
  { code: '032', shortName: 'AGB', name: 'Algeria Gulf Bank', category: 'private' },
  { code: '035', shortName: 'Fransabank', name: 'Fransabank El Djazaïr', category: 'private' },
  { code: '038', shortName: 'Al Salam Bank', name: 'Al Salam Bank Algeria', category: 'private' },
] as const;

export function findAlgerianBankByCode(code: string): AlgerianBankInfo | undefined {
  const normalized = code.replace(/\D/g, '').padStart(3, '0');
  return ALGERIAN_BANKS.find((bank) => bank.code === normalized);
}

/**
 * Calcule la clé RIB Bancaire Algérienne (Mod 97 sur 18 chiffres : Code Banque 3 + Code Agence 5 + Compte 10).
 */
export function computeBankRibKey(bank3: string, agency5: string, account10: string): string | null {
  const bClean = bank3.replace(/\D/g, '');
  const aClean = agency5.replace(/\D/g, '');
  const cClean = account10.replace(/\D/g, '');
  if (!bClean || !aClean || !cClean) return null;
  if (bClean.length > 3 || aClean.length > 5 || cClean.length > 10) return null;
  const b = bClean.padStart(3, '0');
  const a = aClean.padStart(5, '0');
  const c = cClean.padStart(10, '0');
  const base18 = `${b}${a}${c}`;
  if (/^0{18}$/.test(base18)) return null;
  const rem = (BigInt(base18) * 100n) % 97n;
  const key = 97n - rem;
  return String(key).padStart(2, '0');
}

export interface KeyVerificationResult {
  valid: boolean;
  expectedKey: string;
  matchedKind?: 'RIP (Mod 97 + 85)' | 'RIP (Mod 97 std)' | 'CCP (Poids 4..13)' | 'RIB Bancaire (Mod 97)';
  alternateMatch?: string;
}

export function validateBankRib(rib20: string): {
  valid: boolean;
  bankCode: string;
  branchCode: string;
  accountNumber: string;
  actualKey: string;
  expectedKey: string;
  ccpEquivalent: string;
} {
  const clean = rib20.replace(/\D/g, '');
  if (clean.length !== 20) {
    return {
      valid: false,
      bankCode: clean.slice(0, 3),
      branchCode: clean.slice(3, 8),
      accountNumber: clean.slice(8, 18),
      actualKey: clean.slice(18, 20),
      expectedKey: '00',
      ccpEquivalent: '0000000000',
    };
  }
  const bankCode = clean.slice(0, 3);
  const branchCode = clean.slice(3, 8);
  const accountNumber = clean.slice(8, 18);
  const actualKey = clean.slice(18, 20);

  const base18 = clean.slice(0, 18);
  const rem = (BigInt(base18) * 100n) % 97n;
  const expectedKeyBig = 97n - rem;
  const expectedKey = String(expectedKeyBig).padStart(2, '0');
  const valid = actualKey === expectedKey;

  const ccpEquivalent = accountNumber.slice(-10).padStart(10, '0');

  return {
    valid,
    bankCode,
    branchCode,
    accountNumber,
    actualKey,
    expectedKey,
    ccpEquivalent,
  };
}

export function verifyAccountKey(
  prefix8: string,
  ccp10: string,
  actualKey2: string,
  algorithm: KeyAlgorithm
): KeyVerificationResult {
  if (algorithm === 'none') {
    return { valid: true, expectedKey: actualKey2 };
  }

  if (algorithm === 'bank-rib-mod97') {
    const bankRes = validateBankRib(`${prefix8}${ccp10}${actualKey2}`);
    if (bankRes.valid) {
      return { valid: true, expectedKey: bankRes.expectedKey, matchedKind: 'RIB Bancaire (Mod 97)' };
    }
    return { valid: false, expectedKey: bankRes.expectedKey };
  }

  const rip85 = computeRipKeyOffset85(ccp10) ?? '??';
  const ripStd = computeRipKeyStandardMod97(prefix8.length === 8 ? prefix8 : '00799999', ccp10) ?? '??';
  const ccpKey = computeCcpKey(ccp10) ?? '??';

  if (algorithm === 'rip-mod97-85') {
    if (actualKey2 === rip85) {
      return { valid: true, expectedKey: rip85, matchedKind: 'RIP (Mod 97 + 85)' };
    }
    const alternateMatch =
      actualKey2 === ccpKey
        ? `Clé CCP (${ccpKey}) détectée au lieu de la clé RIP (${rip85})`
        : undefined;
    return { valid: false, expectedKey: rip85, alternateMatch };
  }

  if (algorithm === 'ccp-weighted') {
    if (actualKey2 === ccpKey) {
      return { valid: true, expectedKey: ccpKey, matchedKind: 'CCP (Poids 4..13)' };
    }
    return { valid: false, expectedKey: ccpKey };
  }

  if (actualKey2 === rip85) {
    return { valid: true, expectedKey: rip85, matchedKind: 'RIP (Mod 97 + 85)' };
  }
  if (actualKey2 === ccpKey) {
    return { valid: true, expectedKey: ccpKey, matchedKind: 'CCP (Poids 4..13)' };
  }
  return {
    valid: false,
    expectedKey: `${rip85} (RIP) ou ${ccpKey} (CCP)`,
  };
}

/**
 * Masque un numéro de compte CCP/RIB pour le mode confidentialité.
 */
export function maskAccountNumber(value: string, enabled: boolean): string {
  if (!enabled || !value) return value;
  const trimmed = value.trim();
  if (trimmed.length >= 20) {
    return `${trimmed.slice(0, 6)}••••••••••••${trimmed.slice(-2)}`;
  }
  if (trimmed.length >= 6) {
    return `${trimmed.slice(0, 2)}${'•'.repeat(trimmed.length - 4)}${trimmed.slice(-2)}`;
  }
  return '••••';
}

export function maskSensitiveInText(text: string, enabled: boolean): string {
  if (!enabled || !text) return text;
  return text.replace(/(\*?)(\d{6})(\d{12})(\d{2})/g, '$1$2••••••••••••$4');
}

export function formatDZD(centimes: number, impliedDecimals = 2): string {
  const factor = Math.pow(10, impliedDecimals);
  const value = centimes / factor;
  return (
    new Intl.NumberFormat('fr-DZ', {
      minimumFractionDigits: impliedDecimals,
      maximumFractionDigits: impliedDecimals,
    }).format(value) + ' DA'
  );
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}
