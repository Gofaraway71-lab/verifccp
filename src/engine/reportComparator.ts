import {
  AnalysisReport,
  Anomaly,
  AnomalyCategory,
  FileStatus,
  HistoryEntry,
} from '../types/ccp';

export type ComplianceTrend = 'improved' | 'degraded' | 'unchanged';
export type RuleDiffStatus = 'resolved' | 'new' | 'reduced' | 'increased' | 'unchanged';

export interface MetricDelta {
  valueA: number;
  valueB: number;
  delta: number;
}

export interface CategoryDiffRow {
  category: AnomalyCategory;
  label: string;
  countA: number;
  countB: number;
  delta: number;
}

export interface RuleDiffRow {
  ruleCode: string;
  field: string;
  severity: Anomaly['severity'];
  countA: number;
  countB: number;
  delta: number;
  status: RuleDiffStatus;
}

export interface ComparisonResult {
  entryA: HistoryEntry;
  entryB: HistoryEntry;
  reportA?: AnalysisReport;
  reportB?: AnalysisReport;
  sameFormat: boolean;
  trend: ComplianceTrend;
  trendLabel: string;
  trendDescription: string;
  complianceRateA: number;
  complianceRateB: number;
  complianceRateDelta: number;
  beneficiaries: MetricDelta;
  validRecords: MetricDelta;
  invalidRecords: MetricDelta;
  totalAmountCentimes: MetricDelta;
  totalAnomalies: MetricDelta;
  criticalCount: MetricDelta;
  errorCount: MetricDelta;
  warningCount: MetricDelta;
  infoCount: MetricDelta;
  duplicateAccounts: MetricDelta | null;
  repeatedLines: MetricDelta | null;
  categoryDiffs: CategoryDiffRow[];
  ruleDiffs: RuleDiffRow[];
  resolvedAnomalies: Anomaly[];
  newAnomalies: Anomaly[];
  persistingCount: number;
}

const CATEGORY_LABELS: Record<AnomalyCategory, string> = {
  structure: 'Structure (62 car., *, type)',
  rip: 'Format RIP (00799999)',
  'non-rip': 'Format non-RIP (00000000)',
  key: 'Clés de contrôle (CCP / RIP)',
  amount: 'Montants',
  coherence: 'Cohérence globale (totaux / nb)',
  duplicate: 'Doublons et lignes répétées',
  field: 'Champs (période, noms, espaces)',
  encoding: 'Encodage, BOM et fins de ligne',
};

const STATUS_RANK: Record<FileStatus, number> = {
  'non-conforme': 0,
  'a-verifier': 1,
  conforme: 2,
};

function computeComplianceRate(entry: HistoryEntry): number {
  const denom = entry.validRecords + entry.invalidRecords;
  if (denom <= 0) return entry.status === 'conforme' ? 100 : 0;
  return (entry.validRecords / denom) * 100;
}

function makeDelta(valueA: number, valueB: number): MetricDelta {
  return { valueA, valueB, delta: valueB - valueA };
}

function anomalyFingerprint(a: Anomaly): string {
  return `${a.ruleCode}||${a.recordIdentifier}||${a.field}||${a.detectedValue}`;
}

/**
 * Compare deux historiques d'analyses (et leurs rapports complets s'ils sont disponibles en mémoire)
 * afin d'identifier les écarts de conformité, de montants, de règles et d'anomalies.
 */
export function compareAnalyses(
  entryA: HistoryEntry,
  entryB: HistoryEntry,
  reportA?: AnalysisReport,
  reportB?: AnalysisReport
): ComparisonResult {
  const sameFormat = entryA.profileFormat === entryB.profileFormat;
  const complianceRateA = computeComplianceRate(entryA);
  const complianceRateB = computeComplianceRate(entryB);
  const complianceRateDelta = Number((complianceRateB - complianceRateA).toFixed(1));

  const blockingA = entryA.criticalCount + entryA.errorCount;
  const blockingB = entryB.criticalCount + entryB.errorCount;
  const statusDiff = STATUS_RANK[entryB.status] - STATUS_RANK[entryA.status];

  let trend: ComplianceTrend = 'unchanged';
  let trendLabel = 'Conformité équivalente';
  let trendDescription =
    'Les deux fichiers présentent le même niveau global de conformité et un volume d’anomalies identique.';

  if (
    statusDiff > 0 ||
    (statusDiff === 0 && blockingB < blockingA) ||
    (statusDiff === 0 && blockingB === blockingA && entryB.totalAnomalies < entryA.totalAnomalies)
  ) {
    trend = 'improved';
    trendLabel = 'Amélioration de la conformité (B > A)';
    const diffAnom = entryA.totalAnomalies - entryB.totalAnomalies;
    trendDescription =
      statusDiff > 0
        ? `Le statut passe de « ${formatStatusLabel(entryA.status)} » à « ${formatStatusLabel(entryB.status)} » avec ${diffAnom >= 0 ? `${diffAnom} anomalie(s) en moins` : `${Math.abs(diffAnom)} anomalie(s) en plus`}.`
        : `Le fichier B réduit le nombre d’anomalies de ${diffAnom} (${entryA.totalAnomalies} → ${entryB.totalAnomalies}).`;
  } else if (
    statusDiff < 0 ||
    (statusDiff === 0 && blockingB > blockingA) ||
    (statusDiff === 0 && blockingB === blockingA && entryB.totalAnomalies > entryA.totalAnomalies)
  ) {
    trend = 'degraded';
    trendLabel = 'Régression de conformité (B < A)';
    const diffAnom = entryB.totalAnomalies - entryA.totalAnomalies;
    trendDescription =
      statusDiff < 0
        ? `Le statut recule de « ${formatStatusLabel(entryA.status)} » à « ${formatStatusLabel(entryB.status)} » (${diffAnom >= 0 ? `+${diffAnom}` : diffAnom} anomalie(s)).`
        : `Le fichier B comporte ${diffAnom} anomalie(s) supplémentaire(s) par rapport au fichier A (${entryA.totalAnomalies} → ${entryB.totalAnomalies}).`;
  }

  const infoA = reportA ? reportA.summary.countsBySeverity.info : Math.max(0, entryA.totalAnomalies - entryA.criticalCount - entryA.errorCount - entryA.warningCount);
  const infoB = reportB ? reportB.summary.countsBySeverity.info : Math.max(0, entryB.totalAnomalies - entryB.criticalCount - entryB.errorCount - entryB.warningCount);

  const duplicateAccounts =
    reportA && reportB
      ? makeDelta(reportA.summary.duplicateAccounts, reportB.summary.duplicateAccounts)
      : null;
  const repeatedLines =
    reportA && reportB
      ? makeDelta(reportA.summary.repeatedLines, reportB.summary.repeatedLines)
      : null;

  // Catégories
  const categoryDiffs: CategoryDiffRow[] = [];
  if (reportA && reportB) {
    for (const cat of Object.keys(CATEGORY_LABELS) as AnomalyCategory[]) {
      const countA = reportA.summary.countsByCategory[cat] ?? 0;
      const countB = reportB.summary.countsByCategory[cat] ?? 0;
      if (countA > 0 || countB > 0) {
        categoryDiffs.push({
          category: cat,
          label: CATEGORY_LABELS[cat],
          countA,
          countB,
          delta: countB - countA,
        });
      }
    }
    categoryDiffs.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || b.countB - a.countB);
  }

  // Règles et diff d'anomalies individuelles (multiset)
  const ruleDiffs: RuleDiffRow[] = [];
  const resolvedAnomalies: Anomaly[] = [];
  const newAnomalies: Anomaly[] = [];
  let persistingCount = 0;

  if (reportA && reportB) {
    const ruleMap = new Map<
      string,
      { field: string; severity: Anomaly['severity']; countA: number; countB: number }
    >();

    for (const a of reportA.anomalies) {
      const existing = ruleMap.get(a.ruleCode);
      if (existing) {
        existing.countA++;
      } else {
        ruleMap.set(a.ruleCode, { field: a.field, severity: a.severity, countA: 1, countB: 0 });
      }
    }
    for (const b of reportB.anomalies) {
      const existing = ruleMap.get(b.ruleCode);
      if (existing) {
        existing.countB++;
      } else {
        ruleMap.set(b.ruleCode, { field: b.field, severity: b.severity, countA: 0, countB: 1 });
      }
    }

    for (const [ruleCode, info] of ruleMap.entries()) {
      const delta = info.countB - info.countA;
      let status: RuleDiffStatus = 'unchanged';
      if (info.countA > 0 && info.countB === 0) status = 'resolved';
      else if (info.countA === 0 && info.countB > 0) status = 'new';
      else if (delta < 0) status = 'reduced';
      else if (delta > 0) status = 'increased';

      ruleDiffs.push({
        ruleCode,
        field: info.field,
        severity: info.severity,
        countA: info.countA,
        countB: info.countB,
        delta,
        status,
      });
    }

    ruleDiffs.sort((a, b) => {
      const order: Record<RuleDiffStatus, number> = {
        new: 0,
        increased: 1,
        resolved: 2,
        reduced: 3,
        unchanged: 4,
      };
      return order[a.status] - order[b.status] || a.ruleCode.localeCompare(b.ruleCode);
    });

    // Multiset matching pour repérer précisément les anomalies résolues vs nouvelles
    const countMapB = new Map<string, number>();
    for (const b of reportB.anomalies) {
      const fp = anomalyFingerprint(b);
      countMapB.set(fp, (countMapB.get(fp) ?? 0) + 1);
    }

    const remainingFromB = new Map(countMapB);
    for (const a of reportA.anomalies) {
      const fp = anomalyFingerprint(a);
      const avail = remainingFromB.get(fp) ?? 0;
      if (avail > 0) {
        remainingFromB.set(fp, avail - 1);
        persistingCount++;
      } else {
        resolvedAnomalies.push(a);
      }
    }

    const countMapA = new Map<string, number>();
    for (const a of reportA.anomalies) {
      const fp = anomalyFingerprint(a);
      countMapA.set(fp, (countMapA.get(fp) ?? 0) + 1);
    }
    for (const b of reportB.anomalies) {
      const fp = anomalyFingerprint(b);
      const avail = countMapA.get(fp) ?? 0;
      if (avail > 0) {
        countMapA.set(fp, avail - 1);
      } else {
        newAnomalies.push(b);
      }
    }
  }

  return {
    entryA,
    entryB,
    reportA,
    reportB,
    sameFormat,
    trend,
    trendLabel,
    trendDescription,
    complianceRateA,
    complianceRateB,
    complianceRateDelta,
    beneficiaries: makeDelta(entryA.beneficiaryCount, entryB.beneficiaryCount),
    validRecords: makeDelta(entryA.validRecords, entryB.validRecords),
    invalidRecords: makeDelta(entryA.invalidRecords, entryB.invalidRecords),
    totalAmountCentimes: makeDelta(entryA.computedTotalCentimes, entryB.computedTotalCentimes),
    totalAnomalies: makeDelta(entryA.totalAnomalies, entryB.totalAnomalies),
    criticalCount: makeDelta(entryA.criticalCount, entryB.criticalCount),
    errorCount: makeDelta(entryA.errorCount, entryB.errorCount),
    warningCount: makeDelta(entryA.warningCount, entryB.warningCount),
    infoCount: makeDelta(infoA, infoB),
    duplicateAccounts,
    repeatedLines,
    categoryDiffs,
    ruleDiffs,
    resolvedAnomalies,
    newAnomalies,
    persistingCount,
  };
}

export function formatStatusLabel(status: FileStatus): string {
  switch (status) {
    case 'conforme':
      return 'Conforme';
    case 'a-verifier':
      return 'À vérifier';
    case 'non-conforme':
      return 'Non conforme';
  }
}
