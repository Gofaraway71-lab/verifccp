import { computeCcpKey, computeRipKeyOffset85 } from './cryptoKeys';

export interface BuilderBeneficiaryRow {
  id: string;
  account: string; // 10 digits CCP (or 20 digits RIP/non-RIP)
  amountDZD: string; // Amount in DA (e.g. "15000" or "1250,50")
  beneficiaryName: string; // Nom & Prénom (max 27 chars)
}

export interface FileBuilderConfig {
  formatKind: 'rip' | 'non-rip';
  ordonnateurAccount: string; // 10 digits CCP
  month: string; // "01".."12"
  year: string; // "2026"
  lineEnding: 'CRLF' | 'LF';
  beneficiaries: BuilderBeneficiaryRow[];
}

export interface ValidationIssue {
  rowId?: string;
  lineNumber?: number;
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface FileBuilderOutput {
  isValid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  generatedContent: string;
  totalBeneficiaries: number;
  totalCentimes: number;
  ordonnateurFull20: string;
  ordonnateurKey: string;
}

export function generateCcpPaymentFile(config: FileBuilderConfig): FileBuilderOutput {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const prefix = config.formatKind === 'rip' ? '00799999' : '00000000';

  // 1. Validate Ordonnateur account
  const cleanOrd = config.ordonnateurAccount.replace(/\D/g, '');
  if (!cleanOrd) {
    errors.push({
      field: 'Compte ordonnateur',
      message: 'Le numéro de compte CCP de l’ordonnateur est obligatoire.',
      severity: 'error',
    });
  } else if (cleanOrd.length > 10) {
    errors.push({
      field: 'Compte ordonnateur',
      message: 'Le compte CCP de l’ordonnateur ne doit pas dépasser 10 chiffres.',
      severity: 'error',
    });
  }

  const ord10 = cleanOrd.padStart(10, '0');
  const ordKey = computeCcpKey(ord10) ?? '00';
  const ordonnateurFull20 = `${prefix}${ord10}${ordKey}`;

  // 2. Validate Period (Month & Year)
  const monthNum = Number(config.month);
  const yearNum = Number(config.year);
  if (!/^\d{2}$/.test(config.month) || monthNum < 1 || monthNum > 12) {
    errors.push({
      field: 'Mois',
      message: 'Le mois doit être compris entre 01 et 12.',
      severity: 'error',
    });
  }
  if (!/^\d{4}$/.test(config.year) || yearNum < 2000 || yearNum > 2100) {
    errors.push({
      field: 'Année',
      message: 'L’année doit comporter 4 chiffres (ex. 2026).',
      severity: 'error',
    });
  }

  // 3. Validate Beneficiaries
  if (config.beneficiaries.length === 0) {
    errors.push({
      field: 'Bénéficiaires',
      message: 'Le fichier doit contenir au moins un bénéficiaire.',
      severity: 'error',
    });
  }

  let totalCentimes = 0;
  const seenAccounts = new Map<string, number>();
  const formattedBeneficiaryLines: string[] = [];

  config.beneficiaries.forEach((b, index) => {
    const rowLineNum = index + 2;
    const cleanAcc = b.account.replace(/\D/g, '');

    if (!cleanAcc) {
      errors.push({
        rowId: b.id,
        lineNumber: rowLineNum,
        field: 'Compte bénéficiaire',
        message: `Ligne ${rowLineNum} : Le numéro de compte est obligatoire.`,
        severity: 'error',
      });
      return;
    }

    let ccp10 = '';
    if (cleanAcc.length === 20) {
      const p = cleanAcc.slice(0, 8);
      if (p !== prefix) {
        warnings.push({
          rowId: b.id,
          lineNumber: rowLineNum,
          field: 'Préfixe compte',
          message: `Ligne ${rowLineNum} : Le préfixe « ${p} » diffère du format sélectionné (« ${prefix} »).`,
          severity: 'warning',
        });
      }
      ccp10 = cleanAcc.slice(8, 18);
    } else if (cleanAcc.length <= 10) {
      ccp10 = cleanAcc.padStart(10, '0');
    } else {
      errors.push({
        rowId: b.id,
        lineNumber: rowLineNum,
        field: 'Compte bénéficiaire',
        message: `Ligne ${rowLineNum} : Le numéro de compte doit comporter 10 chiffres (ou 20 en bloc RIP/non-RIP).`,
        severity: 'error',
      });
      return;
    }

    const keyCalc = config.formatKind === 'rip' ? (computeRipKeyOffset85(ccp10) ?? '00') : (computeCcpKey(ccp10) ?? '00');
    const fullAccount20 = `${prefix}${ccp10}${keyCalc}`;

    // Duplicate check
    if (seenAccounts.has(fullAccount20)) {
      warnings.push({
        rowId: b.id,
        lineNumber: rowLineNum,
        field: 'Doublon compte',
        message: `Ligne ${rowLineNum} : Ce compte bénéficiaire est déjà présent à la ligne ${seenAccounts.get(fullAccount20)}.`,
        severity: 'warning',
      });
    } else {
      seenAccounts.set(fullAccount20, rowLineNum);
    }

    // Amount parse
    const rawAmtStr = b.amountDZD.replace(/\s/g, '').replace(',', '.');
    const amtNum = Number(rawAmtStr);
    if (!Number.isFinite(amtNum) || amtNum <= 0) {
      errors.push({
        rowId: b.id,
        lineNumber: rowLineNum,
        field: 'Montant',
        message: `Ligne ${rowLineNum} : Montant invalide ou nul (« ${b.amountDZD} »).`,
        severity: 'error',
      });
      return;
    }
    const centimes = Math.round(amtNum * 100);
    totalCentimes += centimes;
    const amount13 = String(centimes).padStart(13, '0');

    // Name parse & pad (27 chars)
    const nameUpper = (b.beneficiaryName || '').toUpperCase().trim();
    if (!nameUpper) {
      errors.push({
        rowId: b.id,
        lineNumber: rowLineNum,
        field: 'Nom et Prénom',
        message: `Ligne ${rowLineNum} : Le nom et prénom du bénéficiaire est obligatoire.`,
        severity: 'error',
      });
      return;
    }
    if (nameUpper.length > 27) {
      warnings.push({
        rowId: b.id,
        lineNumber: rowLineNum,
        field: 'Nom et Prénom',
        message: `Ligne ${rowLineNum} : Le nom dépasse 27 caractères et sera tronqué par Algérie Poste.`,
        severity: 'warning',
      });
    }
    const paddedName = nameUpper.padEnd(27, ' ').slice(0, 27);

    // Build 62-char line
    // * + 20-char account + 13-char amount + 27-char name + '1' = 62 chars
    const detailLine = `*${fullAccount20}${amount13}${paddedName}1`;
    formattedBeneficiaryLines.push(detailLine);
  });

  const totalCount = formattedBeneficiaryLines.length;
  const totalCount7 = String(totalCount).padStart(7, '0');
  const totalAmount13 = String(totalCentimes).padStart(13, '0');

  // Header Line 1 (62 chars)
  // * + 20-char ordonnateur + 13-char totalAmount + 7-char count + 2-char month + 4-char year + 14 spaces + '0' = 62 chars
  const headerLine = `*${ordonnateurFull20}${totalAmount13}${totalCount7}${config.month}${config.year}${' '.repeat(14)}0`;

  const eol = config.lineEnding === 'LF' ? '\n' : '\r\n';
  const allLines = [headerLine, ...formattedBeneficiaryLines];
  const generatedContent = allLines.join(eol);

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    generatedContent,
    totalBeneficiaries: totalCount,
    totalCentimes,
    ordonnateurFull20,
    ordonnateurKey: ordKey,
  };
}

export function parseImportedPaymentText(rawText: string): {
  formatKind?: 'rip' | 'non-rip';
  ordonnateurAccount?: string;
  month?: string;
  year?: string;
  beneficiaries: BuilderBeneficiaryRow[];
  importLogs: string[];
} {
  const lines = rawText.split(/\r\n|\n|\r/).map(l => l.replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, '')).filter(l => l.trim().length > 0);
  const beneficiaries: BuilderBeneficiaryRow[] = [];
  const importLogs: string[] = [];
  let formatKind: 'rip' | 'non-rip' | undefined = undefined;
  let ordonnateurAccount: string | undefined = undefined;
  let month: string | undefined = undefined;
  let year: string | undefined = undefined;

  let lineIndex = 0;
  for (const line of lines) {
    lineIndex++;
    if (line.startsWith('*') && line.length >= 60) {
      const lastChar = line[line.length - 1];
      if (lastChar === '0' && lineIndex === 1) {
        const ordPart = line.slice(1, 21);
        const cleanOrd = ordPart.replace(/\D/g, '');
        if (cleanOrd.startsWith('00799999')) {
          formatKind = 'rip';
          ordonnateurAccount = cleanOrd.slice(8, 18);
        } else if (cleanOrd.length >= 10) {
          formatKind = 'non-rip';
          ordonnateurAccount = cleanOrd.slice(-12, -2) || cleanOrd.slice(0, 10);
        } else {
          ordonnateurAccount = cleanOrd;
        }

        const mStr = line.slice(41, 43).trim();
        if (/^\d{2}$/.test(mStr)) month = mStr;

        const yStr = line.slice(43, 47).trim();
        if (/^\d{4}$/.test(yStr)) year = yStr;

        importLogs.push(`En-tête détecté (ligne ${lineIndex}) : ordonnateur ${ordonnateurAccount}, période ${month}/${year}`);
        continue;
      } else if (lastChar === '1' || line.length >= 61) {
        const accPart = line.slice(1, 21);
        const amtPart = line.slice(21, 34);
        const namePart = line.slice(34, 61);

        const cleanAcc = accPart.replace(/\D/g, '');
        const centimesNum = Number(amtPart.replace(/\D/g, '')) || 0;
        const amountDZD = (centimesNum / 100).toString();
        const beneficiaryName = namePart.trim();

        beneficiaries.push({
          id: `imp-${Math.random().toString(36).substring(2, 9)}`,
          account: cleanAcc,
          amountDZD,
          beneficiaryName,
        });
        continue;
      }
    }

    const delimiter = line.includes(';') ? ';' : line.includes('\t') ? '\t' : line.includes(',') ? ',' : null;
    if (delimiter) {
      const parts = line.split(delimiter).map(p => p.trim().replace(/^["']|["']$/g, ''));
      if (parts.length >= 2) {
        let acc = parts[0];
        let amt = parts[1];
        let name = parts[2] ?? `Bénéficiaire ${lineIndex}`;
        if (!/^\d+$/.test(acc) && /^\d+$/.test(parts[1])) {
          name = parts[0];
          acc = parts[1];
          amt = parts[2] ?? '0';
        }
        beneficiaries.push({
          id: `imp-${Math.random().toString(36).substring(2, 9)}`,
          account: acc,
          amountDZD: amt.replace(',', '.'),
          beneficiaryName: name,
        });
        continue;
      }
    }

    if (line.trim().length > 0) {
      beneficiaries.push({
        id: `imp-${Math.random().toString(36).substring(2, 9)}`,
        account: line.replace(/\D/g, '').slice(0, 10) || '0000000000',
        amountDZD: '10000',
        beneficiaryName: line.replace(/[^a-zA-Z\s]/g, '').trim() || `LIGNE ${lineIndex}`,
      });
    }
  }

  if (beneficiaries.length === 0) {
    importLogs.push("Aucun bénéficiaire valide n'a pu être extrait du fichier.");
  } else {
    importLogs.push(`${beneficiaries.length} bénéficiaire(s) importé(s) avec succès.`);
  }

  return {
    formatKind,
    ordonnateurAccount,
    month,
    year,
    beneficiaries,
    importLogs,
  };
}

