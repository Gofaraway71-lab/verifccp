import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  ExternalLink,
  GitCompare,
  Minus,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { AnalysisReport, HistoryEntry } from '../types/ccp';
import { formatDZD, maskAccountNumber, maskSensitiveInText } from '../engine/cryptoKeys';
import {
  compareAnalyses,
  formatStatusLabel,
  RuleDiffStatus,
} from '../engine/reportComparator';

interface AnalysisComparisonPanelProps {
  history: HistoryEntry[];
  selectedIdA: string;
  selectedIdB: string;
  getReportById: (id: string) => AnalysisReport | undefined;
  privacyMode: boolean;
  onChangeA: (id: string) => void;
  onChangeB: (id: string) => void;
  onSwap: () => void;
  onClose: () => void;
  onOpenReport: (id: string) => void;
}

const STATUS_CLS: Record<HistoryEntry['status'], string> = {
  conforme: 'text-emerald-700 font-semibold',
  'a-verifier': 'text-amber-700 font-semibold',
  'non-conforme': 'text-red-700 font-semibold',
};

const RULE_STATUS_META: Record<RuleDiffStatus, { label: string; cls: string }> = {
  resolved: { label: 'Résolue', cls: 'text-emerald-700 font-semibold' },
  reduced: { label: 'En baisse', cls: 'text-emerald-700 font-medium' },
  new: { label: 'Nouvelle', cls: 'text-red-700 font-semibold' },
  increased: { label: 'En hausse', cls: 'text-red-700 font-medium' },
  unchanged: { label: 'Identique', cls: 'text-slate-500 font-medium' },
};

function formatSignedInt(delta: number): string {
  if (delta === 0) return '0';
  return `${delta > 0 ? '+' : ''}${delta.toLocaleString('fr-FR')}`;
}

function formatSignedDzd(deltaCentimes: number): string {
  if (deltaCentimes === 0) return '0,00 DA';
  const sign = deltaCentimes > 0 ? '+' : '-';
  return `${sign}${formatDZD(Math.abs(deltaCentimes))}`;
}

function deltaTone(delta: number, lowerIsBetter: boolean): string {
  if (delta === 0) return 'text-slate-500';
  const isGood = lowerIsBetter ? delta < 0 : delta > 0;
  return isGood ? 'text-emerald-700 font-semibold' : 'text-red-700 font-semibold';
}

export function AnalysisComparisonPanel({
  history,
  selectedIdA,
  selectedIdB,
  getReportById,
  privacyMode,
  onChangeA,
  onChangeB,
  onSwap,
  onClose,
  onOpenReport,
}: AnalysisComparisonPanelProps) {
  const [detailTab, setDetailTab] = useState<'rules' | 'resolved' | 'new'>('rules');

  const entryA = history.find((h) => h.id === selectedIdA);
  const entryB = history.find((h) => h.id === selectedIdB);

  const comparison = useMemo(() => {
    if (!entryA || !entryB) return null;
    return compareAnalyses(entryA, entryB, getReportById(entryA.id), getReportById(entryB.id));
  }, [entryA, entryB, getReportById]);

  if (!comparison || !entryA || !entryB) return null;

  const TrendIcon =
    comparison.trend === 'improved'
      ? TrendingUp
      : comparison.trend === 'degraded'
        ? TrendingDown
        : Minus;

  const trendBannerCls =
    comparison.trend === 'improved'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : comparison.trend === 'degraded'
        ? 'border-red-200 bg-red-50 text-red-900'
        : 'border-slate-200 bg-slate-50 text-slate-800';

  const trendIconCls =
    comparison.trend === 'improved'
      ? 'text-emerald-700'
      : comparison.trend === 'degraded'
        ? 'text-red-700'
        : 'text-slate-500';

  return (
    <section
      aria-label="Comparateur de conformité entre deux analyses"
      className="rounded-md border border-slate-200 bg-white overflow-hidden"
    >
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <GitCompare className="h-4 w-4 text-[#0F2942] shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Comparaison de conformité (Fichier A vs Fichier B)
            </h3>
            <p className="text-[11px] text-slate-500">
              Évolution des indicateurs, des montants et des anomalies entre deux analyses de session
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSwap}
            className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            <span>Inverser A ↔ B</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la comparaison"
            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap"
          >
            <X className="h-3.5 w-3.5" />
            <span>Fermer</span>
          </button>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Selectors for A and B */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="compare-select-a" className="text-xs font-semibold text-[#0F2942]">
                Analyse A — Référence
              </label>
              <button
                type="button"
                onClick={() => onOpenReport(entryA.id)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0F2942] hover:underline"
              >
                <span>Ouvrir le rapport</span>
                <ExternalLink className="h-3 w-3" />
              </button>
            </div>
            <select
              id="compare-select-a"
              value={entryA.id}
              onChange={(e) => onChangeA(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900"
            >
              {history.map((h) => (
                <option key={h.id} value={h.id} disabled={h.id === entryB.id}>
                  {h.fileName} ({h.profileFormat === 'rip' ? 'RIP' : h.profileFormat === 'rib' ? 'RIB Bancaire' : 'non-RIP'} · {formatStatusLabel(h.status)} ·{' '}
                  {new Date(h.analyzedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })})
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 font-mono truncate">
              {entryA.profileFormat === 'rip' ? 'RIP (00799999)' : entryA.profileFormat === 'rib' ? 'RIB Bancaire (Mod 97)' : 'non-RIP (00000000)'} · {entryA.profileName}
            </p>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="compare-select-b" className="text-xs font-semibold text-[#0F2942]">
                Analyse B — Comparée
              </label>
              <button
                type="button"
                onClick={() => onOpenReport(entryB.id)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0F2942] hover:underline"
              >
                <span>Ouvrir le rapport</span>
                <ExternalLink className="h-3 w-3" />
              </button>
            </div>
            <select
              id="compare-select-b"
              value={entryB.id}
              onChange={(e) => onChangeB(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900"
            >
              {history.map((h) => (
                <option key={h.id} value={h.id} disabled={h.id === entryA.id}>
                  {h.fileName} ({h.profileFormat === 'rip' ? 'RIP' : h.profileFormat === 'rib' ? 'RIB Bancaire' : 'non-RIP'} · {formatStatusLabel(h.status)} ·{' '}
                  {new Date(h.analyzedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })})
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 font-mono truncate">
              {entryB.profileFormat === 'rip' ? 'RIP (00799999)' : entryB.profileFormat === 'rib' ? 'RIB Bancaire (Mod 97)' : 'non-RIP (00000000)'} · {entryB.profileName}
            </p>
          </div>
        </div>

        {/* Trend Verdict Banner */}
        <div className={`rounded-md border px-4 py-3 flex items-start gap-3 text-xs ${trendBannerCls}`}>
          <TrendIcon className={`h-4 w-4 shrink-0 mt-0.5 ${trendIconCls}`} />
          <div className="space-y-0.5">
            <p className="font-semibold">{comparison.trendLabel}</p>
            <p className="opacity-95">{comparison.trendDescription}</p>
          </div>
        </div>

        {!comparison.sameFormat && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 flex items-start gap-2.5 text-xs text-amber-900">
            <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
            <span>
              Attention : vous comparez un fichier analysé au format{' '}
              <strong>{entryA.profileFormat === 'rip' ? 'RIP (00799999)' : entryA.profileFormat === 'rib' ? 'RIB Bancaire (Mod 97)' : 'non-RIP (00000000)'}</strong> avec un
              fichier analysé au format{' '}
              <strong>{entryB.profileFormat === 'rip' ? 'RIP (00799999)' : entryB.profileFormat === 'rib' ? 'RIB Bancaire (Mod 97)' : 'non-RIP (00000000)'}</strong>. Les codes
              règles diffèrent entre les deux moteurs.
            </span>
          </div>
        )}

        {/* Side-by-side Metrics Table */}
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
            <thead className="bg-slate-50 font-semibold text-slate-600">
              <tr>
                <th className="px-4 py-2.5">Indicateur de conformité</th>
                <th className="px-4 py-2.5 text-right">Analyse A (Réf.)</th>
                <th className="px-4 py-2.5 text-right">Analyse B (Comparée)</th>
                <th className="px-4 py-2.5 text-right">Écart (B − A)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="px-4 py-2.5 font-medium text-slate-700">Statut général</td>
                <td className={`px-4 py-2.5 text-right ${STATUS_CLS[entryA.status]}`}>
                  {formatStatusLabel(entryA.status)}
                </td>
                <td className={`px-4 py-2.5 text-right ${STATUS_CLS[entryB.status]}`}>
                  {formatStatusLabel(entryB.status)}
                </td>
                <td className="px-4 py-2.5 text-right text-slate-600">
                  {entryA.status === entryB.status ? 'Identique' : `${formatStatusLabel(entryA.status)} → ${formatStatusLabel(entryB.status)}`}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-medium text-slate-700">Taux de conformité</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-900">
                  {comparison.complianceRateA.toFixed(1)} %
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-900">
                  {comparison.complianceRateB.toFixed(1)} %
                </td>
                <td
                  className={`px-4 py-2.5 text-right font-mono tabular-nums ${deltaTone(
                    comparison.complianceRateDelta,
                    false
                  )}`}
                >
                  {comparison.complianceRateDelta === 0
                    ? '0,0 pt'
                    : `${comparison.complianceRateDelta > 0 ? '+' : ''}${comparison.complianceRateDelta.toFixed(1)} pt`}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-medium text-slate-700">Bénéficiaires</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-900">
                  {comparison.beneficiaries.valueA.toLocaleString('fr-FR')}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-900">
                  {comparison.beneficiaries.valueB.toLocaleString('fr-FR')}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-600">
                  {formatSignedInt(comparison.beneficiaries.delta)}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-medium text-slate-700">Lignes valides</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-emerald-700">
                  {comparison.validRecords.valueA.toLocaleString('fr-FR')}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-emerald-700">
                  {comparison.validRecords.valueB.toLocaleString('fr-FR')}
                </td>
                <td
                  className={`px-4 py-2.5 text-right font-mono tabular-nums ${deltaTone(
                    comparison.validRecords.delta,
                    false
                  )}`}
                >
                  {formatSignedInt(comparison.validRecords.delta)}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-medium text-slate-700">Lignes invalides</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-red-700">
                  {comparison.invalidRecords.valueA.toLocaleString('fr-FR')}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-red-700">
                  {comparison.invalidRecords.valueB.toLocaleString('fr-FR')}
                </td>
                <td
                  className={`px-4 py-2.5 text-right font-mono tabular-nums ${deltaTone(
                    comparison.invalidRecords.delta,
                    true
                  )}`}
                >
                  {formatSignedInt(comparison.invalidRecords.delta)}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-medium text-slate-700">Montant total calculé</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-900">
                  {formatDZD(comparison.totalAmountCentimes.valueA)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-900">
                  {formatDZD(comparison.totalAmountCentimes.valueB)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-700 font-medium">
                  {formatSignedDzd(comparison.totalAmountCentimes.delta)}
                </td>
              </tr>
              <tr className="bg-slate-50/60">
                <td className="px-4 py-2.5 font-semibold text-slate-900">Anomalies totales</td>
                <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums text-slate-900">
                  {comparison.totalAnomalies.valueA.toLocaleString('fr-FR')}
                </td>
                <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums text-slate-900">
                  {comparison.totalAnomalies.valueB.toLocaleString('fr-FR')}
                </td>
                <td
                  className={`px-4 py-2.5 text-right font-mono tabular-nums ${deltaTone(
                    comparison.totalAnomalies.delta,
                    true
                  )}`}
                >
                  {formatSignedInt(comparison.totalAnomalies.delta)}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2 text-slate-600 pl-7">dont Erreurs critiques</td>
                <td className="px-4 py-2 text-right font-mono tabular-nums text-red-800">
                  {comparison.criticalCount.valueA}
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums text-red-800">
                  {comparison.criticalCount.valueB}
                </td>
                <td
                  className={`px-4 py-2 text-right font-mono tabular-nums ${deltaTone(
                    comparison.criticalCount.delta,
                    true
                  )}`}
                >
                  {formatSignedInt(comparison.criticalCount.delta)}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2 text-slate-600 pl-7">dont Erreurs</td>
                <td className="px-4 py-2 text-right font-mono tabular-nums text-red-700">
                  {comparison.errorCount.valueA}
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums text-red-700">
                  {comparison.errorCount.valueB}
                </td>
                <td
                  className={`px-4 py-2 text-right font-mono tabular-nums ${deltaTone(
                    comparison.errorCount.delta,
                    true
                  )}`}
                >
                  {formatSignedInt(comparison.errorCount.delta)}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2 text-slate-600 pl-7">dont Avertissements</td>
                <td className="px-4 py-2 text-right font-mono tabular-nums text-amber-700">
                  {comparison.warningCount.valueA}
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums text-amber-700">
                  {comparison.warningCount.valueB}
                </td>
                <td
                  className={`px-4 py-2 text-right font-mono tabular-nums ${deltaTone(
                    comparison.warningCount.delta,
                    true
                  )}`}
                >
                  {formatSignedInt(comparison.warningCount.delta)}
                </td>
              </tr>
              {comparison.duplicateAccounts && comparison.repeatedLines && (
                <tr>
                  <td className="px-4 py-2.5 font-medium text-slate-700">Doublons / Lignes répétées</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-700">
                    {comparison.duplicateAccounts.valueA} / {comparison.repeatedLines.valueA}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-700">
                    {comparison.duplicateAccounts.valueB} / {comparison.repeatedLines.valueB}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right font-mono tabular-nums ${deltaTone(
                      comparison.duplicateAccounts.delta + comparison.repeatedLines.delta,
                      true
                    )}`}
                  >
                    {formatSignedInt(comparison.duplicateAccounts.delta)} /{' '}
                    {formatSignedInt(comparison.repeatedLines.delta)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Category breakdown if available */}
        {comparison.categoryDiffs.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-800">
              Différences par catégorie d’anomalie
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {comparison.categoryDiffs.map((cat) => (
                <div
                  key={cat.category}
                  className="rounded border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs"
                >
                  <span className="text-slate-700 truncate">{cat.label}</span>
                  <div className="flex items-center gap-2 font-mono tabular-nums shrink-0">
                    <span className="text-slate-500">
                      {cat.countA} → {cat.countB}
                    </span>
                    <span className={deltaTone(cat.delta, true)}>({formatSignedInt(cat.delta)})</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Detailed Rule / Anomaly Diff Tabs */}
        {comparison.reportA && comparison.reportB && (
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex items-center gap-1 rounded-md bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setDetailTab('rules')}
                  className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    detailTab === 'rules'
                      ? 'bg-white text-[#0F2942] shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Par règle ({comparison.ruleDiffs.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab('resolved')}
                  className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    detailTab === 'resolved'
                      ? 'bg-white text-emerald-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Résolues dans B ({comparison.resolvedAnomalies.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab('new')}
                  className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    detailTab === 'new'
                      ? 'bg-white text-red-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Nouvelles dans B ({comparison.newAnomalies.length})
                </button>
              </div>
              <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                Persistantes : {comparison.persistingCount}
              </span>
            </div>

            {detailTab === 'rules' && (
              comparison.ruleDiffs.length === 0 ? (
                <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
                  <span>Aucune anomalie détectée dans aucun des deux fichiers comparés.</span>
                </div>
              ) : (
                <div className="overflow-x-auto rounded border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                    <thead className="bg-slate-50 font-medium text-slate-600">
                      <tr>
                        <th className="px-3 py-2">Code règle</th>
                        <th className="px-3 py-2">Champ concerné</th>
                        <th className="px-3 py-2 text-right">Analyse A</th>
                        <th className="px-3 py-2 text-right">Analyse B</th>
                        <th className="px-3 py-2 text-right">Écart</th>
                        <th className="px-3 py-2 text-right">Évolution</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {comparison.ruleDiffs.map((row) => {
                        const meta = RULE_STATUS_META[row.status];
                        return (
                          <tr key={row.ruleCode}>
                            <td className="px-3 py-2 font-mono font-semibold text-slate-800 whitespace-nowrap">
                              {row.ruleCode}
                            </td>
                            <td className="px-3 py-2 text-slate-700">{row.field}</td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700">
                              {row.countA}
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-900">
                              {row.countB}
                            </td>
                            <td
                              className={`px-3 py-2 text-right font-mono tabular-nums ${deltaTone(
                                row.delta,
                                true
                              )}`}
                            >
                              {formatSignedInt(row.delta)}
                            </td>
                            <td className={`px-3 py-2 text-right whitespace-nowrap ${meta.cls}`}>
                              {meta.label}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {detailTab === 'resolved' && (
              comparison.resolvedAnomalies.length === 0 ? (
                <p className="text-xs text-slate-500 py-2">
                  Aucune anomalie de l’analyse A n’a disparu dans l’analyse B.
                </p>
              ) : (
                <div className="overflow-x-auto rounded border border-emerald-200">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                    <thead className="bg-emerald-50 font-medium text-emerald-900">
                      <tr>
                        <th className="px-3 py-2 w-16">Ligne A</th>
                        <th className="px-3 py-2">Code</th>
                        <th className="px-3 py-2">Champ / Identifiant</th>
                        <th className="px-3 py-2">Anomalie corrigée</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {comparison.resolvedAnomalies.slice(0, 50).map((a) => (
                        <tr key={a.id}>
                          <td className="px-3 py-2 font-mono tabular-nums text-slate-700">
                            {a.lineNumber === 0 ? 'Global' : a.lineNumber}
                          </td>
                          <td className="px-3 py-2 font-mono font-semibold text-emerald-700 whitespace-nowrap">
                            {a.ruleCode}
                          </td>
                          <td className="px-3 py-2">
                            <p className="font-medium text-slate-800">{a.field}</p>
                            <p className="font-mono text-[11px] text-slate-500">
                              {maskAccountNumber(a.recordIdentifier, privacyMode)}
                            </p>
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            {maskSensitiveInText(a.description, privacyMode)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {detailTab === 'new' && (
              comparison.newAnomalies.length === 0 ? (
                <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
                  <span>Aucune nouvelle anomalie introduite dans l’analyse B.</span>
                </div>
              ) : (
                <div className="overflow-x-auto rounded border border-red-200">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                    <thead className="bg-red-50 font-medium text-red-900">
                      <tr>
                        <th className="px-3 py-2 w-16">Ligne B</th>
                        <th className="px-3 py-2">Code</th>
                        <th className="px-3 py-2">Champ / Identifiant</th>
                        <th className="px-3 py-2">Nouvelle anomalie détectée</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {comparison.newAnomalies.slice(0, 50).map((a) => (
                        <tr key={a.id}>
                          <td className="px-3 py-2 font-mono tabular-nums text-slate-700">
                            {a.lineNumber === 0 ? 'Global' : a.lineNumber}
                          </td>
                          <td className="px-3 py-2 font-mono font-semibold text-red-700 whitespace-nowrap flex items-center gap-1">
                            <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                            <span>{a.ruleCode}</span>
                          </td>
                          <td className="px-3 py-2">
                            <p className="font-medium text-slate-800">{a.field}</p>
                            <p className="font-mono text-[11px] text-slate-500">
                              {maskAccountNumber(a.recordIdentifier, privacyMode)}
                            </p>
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            {maskSensitiveInText(a.description, privacyMode)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </section>
  );
}
