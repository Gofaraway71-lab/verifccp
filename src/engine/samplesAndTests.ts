import { AutomatedTestResult, ValidationProfile } from '../types/ccp';
import { analyzeDecodedFile } from './analyzer';
import { evaluateAccountCompliance, evaluateBatchAccounts } from './ccpKeyCalculator';
import {
  computeBankRibKey,
  computeBankRibKey18,
  computeCcpKey,
  computeRipKeyOffset85,
  validateBankRib,
} from './cryptoKeys';
import { decodeRawStringAsFile } from './fileParser';
import { detectFileFormat } from './formatDetector';
import { buildDefaultProfiles } from './profiles';

/**
 * Fichiers réels Algérie Poste fournis par l'utilisateur (exactement à l'octet près, 62 car./ligne, CRLF) :
 * - Ligne 1 ordonnateur : 300076 -> Clé CCP 86
 * - Lignes bénéficiaires : 9396759 -> Clé RIP 69, 4509479 -> Clé RIP 68 (et comptes réels comme 5040 -> Clé CCP 55)
 */
export const REAL_SAMPLE_RIP_VALID = [
  '*0079999900003000768600000080000000000002112026              0',
  '*007999990009396759690000004000000KALKOUL    ABDERRAHMANE    1',
  '*007999990004509479680000004000000TALBI       KHIER          1',
].join('\r\n');

export const REAL_SAMPLE_NON_RIP_VALID = [
  '*0000000000003000768600000080000000000002112026              0',
  '*000000000009396759690000004000000KALKOUL    ABDERRAHMANE    1',
  '*000000000004509479680000004000000TALBI       KHIER          1',
].join('\r\n');

/**
 * Jeux d'essai d'anomalies réalistes (RIP invalide, non-RIP invalide, mixte RIP/non-RIP)
 */
export const SAMPLE_RIP_INVALID = [
  '*0079999900003000769900000120000000000004132026              0', // Clé ordonnateur fausse (99), montant faux, nb=4 vs 3, mois=13
  '*007999990009396759990000004000000KALKOUL    ABDERRAHMANE    1', // Clé erronée (99 au lieu de 69 ou 34)
  '*000000000004509479680000004000000TALBI       KHIER          1', // Préfixe non-RIP 00000000 glissé dans un fichier RIP!
  '*007999990009396759690000000000000BEN@ALI    KARIM         1',   // Doublon RIP, montant nul, '@' interdit, longueur 60 car.
].join('\r\n');

export const SAMPLE_NON_RIP_INVALID = [
  '*0000000000003000768600000090000000000002112026             X0', // Montant global != 80000, zone espaces contient X
  '*007999990009396759690000004000000KALKOUL    ABDERRAHMANE    1', // Préfixe RIP 00799999 glissé dans un fichier non-RIP!
  '*000000000004509479120000004000000                           1', // Clé fausse (12) + Nom vide
].join('\r\n');

export const SAMPLE_FILES_CATALOG = [
  {
    id: 'real-rip-valid',
    name: 'fichier_rip_valide.txt',
    label: 'RIP valide (votre fichier réel)',
    kind: 'rip' as const,
    description: 'Fichier Algérie Poste RIP 62 car. fourni : préfixe 00799999, clés vérifiées (86, 69, 68), total 80 000,00 DA exact.',
    content: REAL_SAMPLE_RIP_VALID,
  },
  {
    id: 'real-nonrip-valid',
    name: 'fichier_no_rip_valide.txt',
    label: 'non-RIP valide (votre fichier réel)',
    kind: 'non-rip' as const,
    description: 'Fichier Algérie Poste non-RIP 62 car. fourni : bourrage 00000000, clés vérifiées (86, 69, 68), total 80 000,00 DA exact.',
    content: REAL_SAMPLE_NON_RIP_VALID,
  },
  {
    id: 'sample-rip-invalid',
    name: 'fichier_rip_anomalies.txt',
    label: 'RIP invalide (anomalies multiples)',
    kind: 'rip' as const,
    description: 'Contient clé ordonnateur fausse (99), clé bénéficiaire fausse (99), ligne non-RIP infiltrée, écart total/comptage, mois 13 et montant nul.',
    content: SAMPLE_RIP_INVALID,
  },
  {
    id: 'sample-nonrip-invalid',
    name: 'fichier_no_rip_anomalies.txt',
    label: 'non-RIP invalide (anomalies multiples)',
    kind: 'non-rip' as const,
    description: 'Contient ligne RIP 00799999 infiltrée, écart montant global, zone espaces altérée, clé CCP erronée et nom vide.',
    content: SAMPLE_NON_RIP_INVALID,
  },
];

function buildValidFixedLine(prefix8: '00799999' | '00000000', ccpNum: number, amountCentimes: number, name: string): string {
  const ccp10 = String(ccpNum).padStart(10, '0');
  const key2 =
    prefix8 === '00799999'
      ? computeRipKeyOffset85(ccp10) ?? '00'
      : computeCcpKey(ccp10) ?? '00';
  const amount13 = String(amountCentimes).padStart(13, '0');
  const name27 = name.slice(0, 27).padEnd(27, ' ');
  return `*${prefix8}${ccp10}${key2}${amount13}${name27}1`;
}

/**
 * Suite complète de tests automatisés couvrant toutes les règles RIP, non-RIP,
 * clés strictes selon le format, encodage, caractères arabes, doublons, fichiers vides, cas limites et charge 5 000 lignes.
 */
export async function runAutomatedTestSuite(profilesArg?: ValidationProfile[]): Promise<AutomatedTestResult[]> {
  const profiles = profilesArg ?? buildDefaultProfiles();
  const ripProfile = profiles.find((p) => p.id === 'ap-rip-fixed-62') ?? buildDefaultProfiles()[0];
  const nonRipProfile = profiles.find((p) => p.id === 'ap-nonrip-fixed-62') ?? buildDefaultProfiles()[1];
  const ribCsvProfile = profiles.find((p) => p.id === 'csv-rib-standard') ?? buildDefaultProfiles()[4];
  const ribFixedProfile = profiles.find((p) => p.id === 'fixed-62-rib') ?? buildDefaultProfiles()[5];

  const results: AutomatedTestResult[] = [];

  const runCase = async (
    id: string,
    name: string,
    category: string,
    formatTested: 'rip' | 'non-rip' | 'rib' | 'both',
    expectedSummary: string,
    sampleFileName: string,
    sampleContent: string,
    fn: () => Promise<{ passed: boolean; actualSummary: string }>
  ) => {
    const t0 = performance.now();
    try {
      const res = await fn();
      results.push({
        id,
        name,
        category,
        formatTested,
        passed: res.passed,
        durationMs: Math.max(1, Math.round(performance.now() - t0)),
        expectedSummary,
        actualSummary: res.actualSummary,
        sampleFileName,
        sampleContent,
      });
    } catch (err) {
      results.push({
        id,
        name,
        category,
        formatTested,
        passed: false,
        durationMs: Math.max(1, Math.round(performance.now() - t0)),
        expectedSummary,
        actualSummary: `Exception inattendue : ${err instanceof Error ? err.message : String(err)}`,
        sampleFileName,
        sampleContent,
      });
    }
  };

  // 1. Fichier RIP conforme
  await runCase(
    'T01',
    'Validation fichier RIP conforme (62 car., Clés RIP)',
    'Format RIP',
    'rip',
    'Détection RIP >= 95%, statut Conforme, 0 anomalie, total 80 000,00 DA',
    'fichier_rip_valide.txt',
    REAL_SAMPLE_RIP_VALID,
    async () => {
      const dec = decodeRawStringAsFile('fichier_rip_valide.txt', REAL_SAMPLE_RIP_VALID);
      const det = detectFileFormat(dec);
      const rep = await analyzeDecodedFile(dec, det, ripProfile);
      const ok =
        det.detectedFormat === 'rip' &&
        det.confidence >= 95 &&
        rep.status === 'conforme' &&
        rep.anomalies.length === 0 &&
        rep.summary.computedTotalCentimes === 8000000;
      return {
        passed: ok,
        actualSummary: `Détecté ${det.detectedFormat} (${det.confidence}%), statut=${rep.status}, anomalies=${rep.anomalies.length}, total=${rep.summary.computedTotalCentimes / 100} DA`,
      };
    }
  );

  // 2. Fichier non-RIP conforme
  await runCase(
    'T02',
    'Validation fichier non-RIP conforme (62 car., Clés CCP)',
    'Format non-RIP',
    'non-rip',
    'Détection non-RIP >= 95%, statut Conforme, 0 anomalie, total 80 000,00 DA',
    'fichier_no_rip_valide.txt',
    REAL_SAMPLE_NON_RIP_VALID,
    async () => {
      const dec = decodeRawStringAsFile('fichier_no_rip_valide.txt', REAL_SAMPLE_NON_RIP_VALID);
      const det = detectFileFormat(dec);
      const rep = await analyzeDecodedFile(dec, det, nonRipProfile);
      const ok =
        det.detectedFormat === 'non-rip' &&
        det.confidence >= 95 &&
        rep.status === 'conforme' &&
        rep.anomalies.length === 0 &&
        rep.summary.computedTotalCentimes === 8000000;
      return {
        passed: ok,
        actualSummary: `Détecté ${det.detectedFormat} (${det.confidence}%), statut=${rep.status}, anomalies=${rep.anomalies.length}, total=${rep.summary.computedTotalCentimes / 100} DA`,
      };
    }
  );

  // 3. Étanchéité stricte : fichier non-RIP passé dans le moteur RIP -> rejet critique
  await runCase(
    'T03',
    'Étanchéité RIP : rejet d’un fichier non-RIP soumis au profil RIP',
    'Séparation RIP / non-RIP',
    'rip',
    'Statut Non conforme, 3 erreurs critiques RIP-FMT-01 (préfixe 00000000 rejeté)',
    'non_rip_dans_rip.txt',
    REAL_SAMPLE_NON_RIP_VALID,
    async () => {
      const dec = decodeRawStringAsFile('non_rip_dans_rip.txt', REAL_SAMPLE_NON_RIP_VALID);
      const det = detectFileFormat(dec);
      const rep = await analyzeDecodedFile(dec, det, ripProfile);
      const prefixErrors = rep.anomalies.filter((a) => a.ruleCode === 'RIP-FMT-01');
      const ok = rep.status === 'non-conforme' && prefixErrors.length === 3 && rep.profileMismatchWarning;
      return {
        passed: ok,
        actualSummary: `Statut=${rep.status}, erreurs RIP-FMT-01=${prefixErrors.length}, alerte mismatch=${rep.profileMismatchWarning}`,
      };
    }
  );

  // 4. Étanchéité stricte : fichier RIP passé dans le moteur non-RIP -> rejet critique
  await runCase(
    'T04',
    'Étanchéité non-RIP : rejet d’un fichier RIP soumis au profil non-RIP',
    'Séparation RIP / non-RIP',
    'non-rip',
    'Statut Non conforme, 3 erreurs critiques NRIP-FMT-01 (préfixe 00799999 rejeté)',
    'rip_dans_non_rip.txt',
    REAL_SAMPLE_RIP_VALID,
    async () => {
      const dec = decodeRawStringAsFile('rip_dans_non_rip.txt', REAL_SAMPLE_RIP_VALID);
      const det = detectFileFormat(dec);
      const rep = await analyzeDecodedFile(dec, det, nonRipProfile);
      const prefixErrors = rep.anomalies.filter((a) => a.ruleCode === 'NRIP-FMT-01');
      const ok = rep.status === 'non-conforme' && prefixErrors.length === 3 && rep.profileMismatchWarning;
      return {
        passed: ok,
        actualSummary: `Statut=${rep.status}, erreurs NRIP-FMT-01=${prefixErrors.length}, alerte mismatch=${rep.profileMismatchWarning}`,
      };
    }
  );

  // 5. Algorithmes mathématiques Clé RIP (+85) et Clé CCP (poids 4..13)
  await runCase(
    'T05',
    'Exactitude mathématique des clés CCP et RIP (Mod 97 + 85)',
    'Clés de contrôle',
    'both',
    '300076→CCP:86/RIP:41 · 9396759→CCP:34/RIP:69 · 4509479→CCP:43/RIP:68',
    'cles_math.txt',
    '300076 (CCP 86 / RIP 41), 9396759 (CCP 34 / RIP 69), 4509479 (CCP 43 / RIP 68)',
    async () => {
      const c1 = computeCcpKey('0000300076');
      const r1 = computeRipKeyOffset85('0000300076');
      const c2 = computeCcpKey('0009396759');
      const r2 = computeRipKeyOffset85('0009396759');
      const c3 = computeCcpKey('0004509479');
      const r3 = computeRipKeyOffset85('0004509479');
      const ok = c1 === '86' && r1 === '41' && c2 === '34' && r2 === '69' && c3 === '43' && r3 === '68';
      return {
        passed: ok,
        actualSummary: `300076(${c1}/${r1}), 9396759(${c2}/${r2}), 4509479(${c3}/${r3})`,
      };
    }
  );

  // 6. Fichier RIP invalide complet
  await runCase(
    'T06',
    'Détection multi-anomalies sur fichier RIP invalide',
    'Format RIP',
    'rip',
    'Détecte ambiguïté RIP/non-RIP, clé ordonnateur/bénéficiaire fausse, écart total/nombre, mois 13, longueur != 62, montant nul',
    'fichier_rip_anomalies.txt',
    SAMPLE_RIP_INVALID,
    async () => {
      const dec = decodeRawStringAsFile('fichier_rip_anomalies.txt', SAMPLE_RIP_INVALID);
      const det = detectFileFormat(dec);
      const rep = await analyzeDecodedFile(dec, det, ripProfile);
      const codes = new Set(rep.anomalies.map((a) => a.ruleCode));
      const ok =
        det.detectedFormat === 'ambiguous' &&
        codes.has('RIP-KEY-02') &&
        codes.has('RIP-KEY-01') &&
        codes.has('RIP-FMT-01') &&
        codes.has('RIP-COH-01') &&
        codes.has('RIP-COH-02') &&
        codes.has('RIP-STR-02') &&
        codes.has('RIP-MNT-01');
      return {
        passed: ok,
        actualSummary: `Détection=${det.detectedFormat} (${det.confidence}%), ${rep.anomalies.length} anomalies (${Array.from(codes).join(', ')})`,
      };
    }
  );

  // 7. Fichier non-RIP invalide complet
  await runCase(
    'T07',
    'Détection multi-anomalies sur fichier non-RIP invalide',
    'Format non-RIP',
    'non-rip',
    'Détecte ligne RIP infiltrée, écart montant global, espace altéré, clé CCP fausse et nom vide',
    'fichier_no_rip_anomalies.txt',
    SAMPLE_NON_RIP_INVALID,
    async () => {
      const dec = decodeRawStringAsFile('fichier_no_rip_anomalies.txt', SAMPLE_NON_RIP_INVALID);
      const det = detectFileFormat(dec);
      const rep = await analyzeDecodedFile(dec, det, nonRipProfile);
      const codes = new Set(rep.anomalies.map((a) => a.ruleCode));
      const ok =
        codes.has('NRIP-FMT-01') &&
        codes.has('NRIP-COH-01') &&
        codes.has('NRIP-ENT-01') &&
        codes.has('NRIP-KEY-01') &&
        codes.has('NRIP-BEN-01');
      return {
        passed: ok,
        actualSummary: `${rep.anomalies.length} anomalies détectées (${Array.from(codes).join(', ')})`,
      };
    }
  );

  // 8. Fichier vide
  await runCase(
    'T08',
    'Gestion propre d’un fichier vide (0 octet)',
    'Cas limites',
    'both',
    'Détection unknown (0%), statut Non conforme, erreur critique RIP-STR-01 sans crash',
    'fichier_vide.txt',
    '',
    async () => {
      const dec = decodeRawStringAsFile('fichier_vide.txt', '');
      const det = detectFileFormat(dec);
      const rep = await analyzeDecodedFile(dec, det, ripProfile);
      const ok = det.detectedFormat === 'unknown' && rep.status === 'non-conforme' && rep.summary.countsBySeverity.critical >= 1;
      return {
        passed: ok,
        actualSummary: `Détection=${det.detectedFormat}, statut=${rep.status}, critiques=${rep.summary.countsBySeverity.critical}`,
      };
    }
  );

  // 9. Fichier incomplet (en-tête seul sans bénéficiaire)
  const headerOnly = '*0079999900003000764100000000000000000000112026              0';
  await runCase(
    'T09',
    'Fichier incomplet (ligne d’en-tête seule sans bénéficiaire)',
    'Cas limites',
    'rip',
    'Signale RIP-STR-01 (0 bénéficiaire) et montant nul',
    'entete_seule.txt',
    headerOnly,
    async () => {
      const dec = decodeRawStringAsFile('entete_seule.txt', headerOnly);
      const det = detectFileFormat(dec);
      const rep = await analyzeDecodedFile(dec, det, ripProfile);
      const ok = rep.anomalies.some((a) => a.ruleCode === 'RIP-STR-01') && rep.status === 'non-conforme';
      return {
        passed: ok,
        actualSummary: `Statut=${rep.status}, anomalies=${rep.anomalies.map((a) => a.ruleCode).join(', ')}`,
      };
    }
  );

  // 10. Doublons de comptes et lignes répétées
  const dupContent = [
    '*0079999900003000764100000080000000000002112026              0',
    '*007999990009396759690000004000000KALKOUL    ABDERRAHMANE    1',
    '*007999990009396759690000004000000KALKOUL    ABDERRAHMANE    1',
  ].join('\r\n');
  await runCase(
    'T10',
    'Détection des doublons de comptes et lignes répétées',
    'Doublons',
    'rip',
    'Détecte 1 ligne répétée + statut À vérifier (avertissement RIP-DBL-01)',
    'doublons_rip.txt',
    dupContent,
    async () => {
      const dec = decodeRawStringAsFile('doublons_rip.txt', dupContent);
      const det = detectFileFormat(dec);
      const rep = await analyzeDecodedFile(dec, det, ripProfile);
      const ok = rep.summary.repeatedLines === 1 && rep.status === 'a-verifier' && rep.anomalies.some((a) => a.ruleCode === 'RIP-DBL-01');
      return {
        passed: ok,
        actualSummary: `Lignes répétées=${rep.summary.repeatedLines}, statut=${rep.status}`,
      };
    }
  );

  // 11. Caractères arabes dans les noms (27 caractères exacts)
  const arabicLine = buildValidFixedLine('00799999', 9396759, 4000000, 'محمد بن علي');
  const arabicContent = [
    '*0079999900003000764100000040000000000001112026              0',
    arabicLine,
  ].join('\r\n');
  await runCase(
    'T11',
    'Prise en charge des noms en caractères arabes (UTF-8)',
    'Encodage & Langues',
    'rip',
    'Accepte les lettres arabes lorsque activé dans le profil (0 anomalie)',
    'beneficiaires_arabes.txt',
    arabicContent,
    async () => {
      const dec = decodeRawStringAsFile('beneficiaires_arabes.txt', arabicContent);
      const det = detectFileFormat(dec);
      const rep = await analyzeDecodedFile(dec, det, ripProfile);
      const ok = rep.status === 'conforme' && rep.anomalies.length === 0;
      return {
        passed: ok,
        actualSummary: `Statut=${rep.status}, anomalies=${rep.anomalies.length}, longueur ligne=${arabicLine.length}`,
      };
    }
  );

  // 12. Caractères spéciaux interdits dans le nom
  const specialContent = [
    '*0079999900003000764100000040000000000001112026              0',
    '*007999990009396759690000004000000KALKOUL#123 ABDERRAHMANE   1',
  ].join('\r\n');
  await runCase(
    'T12',
    'Rejet des caractères spéciaux et chiffres dans le nom bénéficiaire',
    'Données & Caractères',
    'rip',
    'Détecte erreur RIP-BEN-01 sur les caractères # 1 2 3',
    'caracteres_speciaux.txt',
    specialContent,
    async () => {
      const dec = decodeRawStringAsFile('caracteres_speciaux.txt', specialContent);
      const det = detectFileFormat(dec);
      const rep = await analyzeDecodedFile(dec, det, ripProfile);
      const ok = rep.anomalies.some((a) => a.ruleCode === 'RIP-BEN-01') && rep.status === 'non-conforme';
      return {
        passed: ok,
        actualSummary: `Statut=${rep.status}, erreurs=${rep.anomalies.map((a) => a.ruleCode).join(', ')}`,
      };
    }
  );

  // 13. Fichier mal encodé (BOM + fins de ligne mixtes + ligne vide) + correction sûre
  const dirtyContent =
    '\uFEFF*0079999900003000764100000080000000000002112026              0\n' +
    '*007999990009396759690000004000000KALKOUL    ABDERRAHMANE    1\r\n' +
    '\r\n' +
    '*007999990004509479680000004000000TALBI       KHIER          1';
  await runCase(
    'T13',
    'Détection BOM / fins de ligne mixtes / ligne vide et correction sûre non destructive',
    'Encodage & Hygiène',
    'rip',
    'Signale BOM + MIXED + ligne vide et propose un fichier nettoyé conforme sans toucher aux RIP/montants',
    'encodage_hygiene.txt',
    dirtyContent,
    async () => {
      const dec = decodeRawStringAsFile('encodage_hygiene.txt', dirtyContent);
      const det = detectFileFormat(dec);
      const rep = await analyzeDecodedFile(dec, det, ripProfile);
      const reDec = decodeRawStringAsFile('nettoye.txt', rep.safeCorrection.correctedContent);
      const reDet = detectFileFormat(reDec);
      const reRep = await analyzeDecodedFile(reDec, reDet, ripProfile);
      const ok = rep.safeCorrection.hasChanges && reRep.status === 'conforme' && reRep.anomalies.length === 0;
      return {
        passed: ok,
        actualSummary: `Avant=${rep.anomalies.length} avert., après nettoyage sûr=${reRep.anomalies.length} anomalie (${reRep.status})`,
      };
    }
  );

  // 14. Test de performance volumétrique (5 000 bénéficiaires RIP)
  const bulkCount = 5000;
  const amountEach = 3500000; // 35 000,00 DA
  const totalBulk = bulkCount * amountEach;
  const bulkLines: string[] = [
    `*00799999000030007641${String(totalBulk).padStart(13, '0')}${String(bulkCount).padStart(7, '0')}112026              0`,
  ];
  for (let i = 1; i <= bulkCount; i++) {
    bulkLines.push(buildValidFixedLine('00799999', 1000000 + i, amountEach, `AGENT BENEFICIAIRE ${String(i).padStart(4, '0')}`.replace(/\d/g, 'A')));
  }
  const bulkContent = bulkLines.join('\r\n');

  await runCase(
    'T14',
    `Performance volumétrique (${bulkCount.toLocaleString('fr-FR')} lignes RIP)`,
    'Performance',
    'rip',
    `${bulkCount} bénéficiaires analysés sans blocage, statut Conforme, 0 anomalie`,
    'lot_5000_lignes_rip.txt',
    bulkLines.slice(0, 5).join('\r\n') + '\r\n...',
    async () => {
      const dec = decodeRawStringAsFile('lot_5000_lignes_rip.txt', bulkContent);
      const det = detectFileFormat(dec);
      const rep = await analyzeDecodedFile(dec, det, ripProfile);
      const ok =
        rep.status === 'conforme' &&
        rep.summary.beneficiaryCount === bulkCount &&
        rep.summary.computedTotalCentimes === totalBulk;
      return {
        passed: ok,
        actualSummary: `${rep.summary.beneficiaryCount} lignes validées en ${rep.durationMs} ms, statut=${rep.status}`,
      };
    }
  );

  // 15. Cas réel Algérie Poste : 00799999000000504055 (Clé 55) et 00799999000000504024 (Clé 24) acceptés, clé 99 rejetée
  const realCcpOnRipContent = [
    '*0079999900003000768600000120000000000003112026              0', // Clé CCP 86 valide
    '*007999990000005040550000004000000BENEFICIAIRE CLE CCP       1', // Compte 5040, Clé CCP 55 -> VALIDE
    '*007999990000005040240000004000000BENEFICIAIRE CLE RIP       1', // Compte 5040, Clé RIP 24 -> VALIDE
    '*007999990000005040990000004000000BENEFICIAIRE CLE FAUSSE    1', // Compte 5040, Clé 99 -> INVALIDE (RIP 24 ou CCP 55)
  ].join('\r\n');
  await runCase(
    'T15',
    'Cas réel Algérie Poste : 00799999000000504055 (Clé 55) et 5040/24 valides, clé 99 rejetée',
    'Clés de contrôle',
    'rip',
    'Accepte 5040/55, 5040/24 et 300076/86, rejette uniquement 5040/99 (RIP-KEY-01)',
    'cas_reel_5040_55.txt',
    realCcpOnRipContent,
    async () => {
      const dec = decodeRawStringAsFile('cas_reel_5040_55.txt', realCcpOnRipContent);
      const det = detectFileFormat(dec);
      const rep = await analyzeDecodedFile(dec, det, ripProfile);
      const errL2 = rep.anomalies.filter((a) => a.lineNumber === 2);
      const errL3 = rep.anomalies.filter((a) => a.lineNumber === 3);
      const errL4 = rep.anomalies.find((a) => a.ruleCode === 'RIP-KEY-01' && a.lineNumber === 4);
      const ok =
        rep.status === 'non-conforme' &&
        errL2.length === 0 &&
        errL3.length === 0 &&
        Boolean(errL4?.expectedRule.includes('24')) &&
        Boolean(errL4?.expectedRule.includes('55'));
      return {
        passed: ok,
        actualSummary: `L2(5040/55)=${errL2.length} err, L3(5040/24)=${errL3.length} err, L4(5040/99)=${errL4?.ruleCode ?? 'aucune'} (${errL4?.expectedRule ?? '—'})`,
      };
    }
  );

  // 16. Mode strict configurable par profil (Clé RIP uniquement sur RIP, Clé CCP uniquement sur non-RIP)
  const strictRipProfile: ValidationProfile = {
    ...ripProfile,
    headerKeyAlgorithm: 'rip-mod97-85',
    detailKeyAlgorithm: 'rip-mod97-85',
  };
  const strictNonRipProfile: ValidationProfile = {
    ...nonRipProfile,
    headerKeyAlgorithm: 'ccp-weighted',
    detailKeyAlgorithm: 'ccp-weighted',
  };
  await runCase(
    'T16',
    'Mode strict configurable : rejet d’une Clé CCP sur RIP strict et Clé RIP sur non-RIP strict',
    'Clés de contrôle',
    'both',
    'Rejette 5040/55 en profil RIP strict (attend 24) et 9396759/69 en profil non-RIP strict (attend 34)',
    'mode_strict_profil.txt',
    REAL_SAMPLE_NON_RIP_VALID,
    async () => {
      const decRip = decodeRawStringAsFile(
        'strict_rip.txt',
        [
          '*0079999900003000764100000040000000000001112026              0',
          '*007999990000005040550000004000000TEST STRICT                1',
        ].join('\r\n')
      );
      const repRip = await analyzeDecodedFile(decRip, detectFileFormat(decRip), strictRipProfile);
      const decNonRip = decodeRawStringAsFile('strict_nonrip.txt', REAL_SAMPLE_NON_RIP_VALID);
      const repNonRip = await analyzeDecodedFile(decNonRip, detectFileFormat(decNonRip), strictNonRipProfile);
      const ripErr = repRip.anomalies.find((a) => a.ruleCode === 'RIP-KEY-01' && a.expectedRule.includes('24'));
      const nonRipErr = repNonRip.anomalies.find((a) => a.ruleCode === 'NRIP-KEY-01' && a.expectedRule.includes('34'));
      const ok = Boolean(ripErr) && Boolean(nonRipErr);
      return {
        passed: ok,
        actualSummary: `RIP strict=${ripErr?.expectedRule ?? 'KO'}, non-RIP strict=${nonRipErr?.expectedRule ?? 'KO'}`,
      };
    }
  );

  // 17. Module dédié engine/ccpKeyCalculator.ts (Algérie Poste + strict + lot + lignes 62 car.)
  await runCase(
    'T17',
    'Module calculateur de clé CCP/RIP (unitaire, lot, Algérie Poste & mode strict)',
    'Clés de contrôle',
    'both',
    'Valide 00799999000000504055 en mode Algérie Poste, rejette 99, détecte mode strict et agrège le lot',
    'calculateur_ccp_rip.txt',
    '00799999000000504055\r\n00799999000939675969\r\n00000000000030007686\r\n00799999000000504099',
    async () => {
      const e5040Ap = evaluateAccountCompliance('00799999000000504055', 'rip', '', 'algerie-poste');
      const e5040Strict = evaluateAccountCompliance('00799999000000504055', 'rip', '', 'strict');
      const e5040Bad = evaluateAccountCompliance('00799999000000504099', 'rip', '', 'algerie-poste');
      const ePair = evaluateAccountCompliance('5040/55', 'non-rip', '', 'algerie-poste');
      const eLine = evaluateAccountCompliance(
        '*007999990009396759690000004000000KALKOUL    ABDERRAHMANE    1',
        'non-rip',
        '',
        'algerie-poste'
      );
      const batch = evaluateBatchAccounts(
        '00799999000000504055\n00799999000939675969\n00000000000030007686\n00799999000000504099',
        'rip',
        'algerie-poste'
      );
      const ok =
        e5040Ap.effectiveFormat === 'rip' &&
        e5040Ap.compliance?.status === 'conforme' &&
        e5040Strict.compliance?.status === 'cross-format-ccp-on-rip' &&
        e5040Strict.compliance?.expectedKey === '24' &&
        e5040Bad.compliance?.status === 'invalid-key' &&
        ePair.compliance?.status === 'conforme' &&
        eLine.effectiveFormat === 'rip' &&
        eLine.compliance?.status === 'conforme' &&
        batch.summary.total === 4 &&
        batch.summary.compliantCount === 3 &&
        batch.summary.nonCompliantCount === 1;
      return {
        passed: ok,
        actualSummary: `5040/55 AP=${e5040Ap.compliance?.status}, strict=${e5040Strict.compliance?.status}, lot=${batch.summary.compliantCount}/${batch.summary.total} conformes`,
      };
    }
  );

  // 18. Fichiers bancaires RIB largeur fixe 62 car. (valide + anomalies clé Mod 97 et totaux)
  const kBnaOrd = computeBankRibKey('001', '00101', '0000112233') ?? '00';
  const kBna1 = computeBankRibKey('001', '00101', '0012345678') ?? '00';
  const kBea2 = computeBankRibKey('002', '00205', '0098765432') ?? '00';
  const bankFixedValid = [
    `*001001010000112233${kBnaOrd}00000080000000000002112026              0`,
    `*001001010012345678${kBna1}0000004500000BENALI      KARIM          1`,
    `*002002050098765432${kBea2}0000003500000MEZIANE     NADIA          1`,
  ].join('\r\n');
  const bankFixedInvalid = [
    `*001001010000112233${kBnaOrd}00000090000000000002112026              0`,
    `*001001010012345678990000004500000BENALI      KARIM          1`,
    `*002002050098765432${kBea2}0000003500000MEZIANE     NADIA          1`,
  ].join('\r\n');

  await runCase(
    'T18',
    'Validation fichier bancaire RIB largeur fixe 62 car. (001 BNA / 002 BEA Mod 97 & totaux L1)',
    'Format RIB Bancaire',
    'rib',
    'Détection rib >= 95%, Conforme sans doublage du total L1 (80 000 DA), rejet clé erronée et écart total',
    'virement_bancaire_62.txt',
    bankFixedValid,
    async () => {
      const decOk = decodeRawStringAsFile('virement_bancaire_62.txt', bankFixedValid);
      const detOk = detectFileFormat(decOk);
      const repOk = await analyzeDecodedFile(decOk, detOk, ribFixedProfile);

      const decKo = decodeRawStringAsFile('virement_bancaire_ko.txt', bankFixedInvalid);
      const detKo = detectFileFormat(decKo);
      const repKo = await analyzeDecodedFile(decKo, detKo, ribFixedProfile);
      const codesKo = new Set(repKo.anomalies.map((a) => a.ruleCode));

      const ok =
        detOk.detectedFormat === 'rib' &&
        detOk.suggestedProfileId === 'fixed-62-rib' &&
        detOk.confidence >= 95 &&
        repOk.status === 'conforme' &&
        repOk.anomalies.length === 0 &&
        repOk.summary.computedTotalCentimes === 8000000 &&
        repOk.summary.declaredTotalCentimes === 8000000 &&
        repOk.summary.beneficiaryCount === 2 &&
        repKo.status === 'non-conforme' &&
        codesKo.has('RIB-KEY-01') &&
        codesKo.has('RIB-COH-01');

      return {
        passed: ok,
        actualSummary: `Valide=${detOk.detectedFormat}(${detOk.confidence}%)/${repOk.status}/total=${repOk.summary.computedTotalCentimes / 100} DA ; Invalide=${Array.from(codesKo).join(', ')}`,
      };
    }
  );

  // 19. Fichiers bancaires RIB tabulaires (CSV virgule sans en-tête + tirets + mixte CCP/RIB)
  const kBadr3 = computeBankRibKey('003', '00310', '0011223344') ?? '00';
  const bankCsvCommaNoHeader = [
    `001-00101-0012345678-${kBna1},25000.50,KARIM BENALI`,
    `002 00205 0098765432 ${kBea2},15000,NADIA MEZIANE`,
    `003003100011223344${kBadr3},10000.00,YACINE TOUMI`,
  ].join('\n');

  await runCase(
    'T19',
    'Analyse CSV bancaire délimité par virgule sans en-tête et RIB formatés (tirets/espaces)',
    'Format RIB Bancaire',
    'rib',
    'Détecte rib (delimited , sans en-tête), valide les 3 lignes sans perte de ligne 1, total = 50 000,50 DA',
    'virement_bancaire.csv',
    bankCsvCommaNoHeader,
    async () => {
      const dec = decodeRawStringAsFile('virement_bancaire.csv', bankCsvCommaNoHeader);
      const det = detectFileFormat(dec);
      const rep = await analyzeDecodedFile(dec, det, ribCsvProfile);
      const ok =
        det.detectedFormat === 'rib' &&
        det.delimiter === ',' &&
        det.hasHeader === false &&
        det.suggestedProfileId === 'csv-rib-standard' &&
        rep.status === 'conforme' &&
        rep.summary.beneficiaryCount === 3 &&
        rep.summary.computedTotalCentimes === 5000050;
      return {
        passed: ok,
        actualSummary: `Détecté=${det.detectedFormat} (delim=${det.delimiter}, header=${det.hasHeader}), lignes=${rep.summary.beneficiaryCount}, total=${rep.summary.computedTotalCentimes / 100} DA, statut=${rep.status}`,
      };
    }
  );

  // 20. Exactitude de la clé bancaire officielle Banque d'Algérie (ABC Bank 014 / Clé 48 vs variante 01)
  await runCase(
    'T20',
    'Conformité clé bancaire Banque d’Algérie : compte 014003411681930101 -> Clé officielle 48 et variante 01',
    'Format RIB Bancaire',
    'rib',
    'Valide que l’algorithme officiel DZ (sur Agence 5 + Compte 10) produit exactement la clé 48 pour le compte 014 00341 1681930101, et accepte la variante 01',
    'compte_014_cle_48.txt',
    '*014003411681930101480000005000000ABC CLIENT TEST             1',
    async () => {
      const kOfficial = computeBankRibKey('014', '00341', '1681930101');
      const kVariant18 = computeBankRibKey18('014', '00341', '1681930101');
      const valOfficial = validateBankRib('01400341168193010148');
      const valVariant18 = validateBankRib('01400341168193010101');
      const valBad = validateBankRib('01400341168193010199');
      const evalOfficial = evaluateAccountCompliance('01400341168193010148', 'bank-rib');
      const evalNoKey = evaluateAccountCompliance('014003411681930101', 'bank-rib');

      const ok =
        kOfficial === '48' &&
        kVariant18 === '01' &&
        valOfficial.valid === true &&
        valOfficial.expectedKey === '48' &&
        valOfficial.matchedStandard === 'algerie-15' &&
        valVariant18.valid === true &&
        valVariant18.expectedKey === '01' &&
        valVariant18.matchedStandard === 'etendu-18' &&
        valBad.valid === false &&
        evalOfficial.compliance?.status === 'conforme' &&
        evalNoKey.calculation?.bankRib?.keyMod97 === '48' &&
        evalNoKey.calculation?.bankRib?.keyMod97_18 === '01';

      return {
        passed: ok,
        actualSummary: `Clé officielle=${kOfficial} (attendu: 48), variante 18=${kVariant18} (attendu: 01), val48=${valOfficial.valid}, val01=${valVariant18.valid}, calcul=${evalNoKey.calculation?.bankRib?.keyMod97}`,
      };
    }
  );

  return results;
}
