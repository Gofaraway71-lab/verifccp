import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, FileText, GitCompare, HardDriveDownload, Search, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { AnalysisReport, HistoryEntry } from '../types/ccp';
import {
  findAlgerianBankByCode,
  formatDZD,
  formatFileSize,
  maskAccountNumber,
} from '../engine/cryptoKeys';
import { SAMPLE_FILES_CATALOG } from '../engine/samplesAndTests';
import { AnalysisComparisonPanel } from './AnalysisComparisonPanel';

interface DashboardViewProps {
  history: HistoryEntry[];
  hasReportForId: (id: string) => boolean;
  getReportById: (id: string) => AnalysisReport | undefined;
  privacyMode: boolean;
  onOpenReport: (id: string) => void;
  onDeleteHistoryItem: (id: string) => void;
  onGoImport: () => void;
  onGoOfflineInstall?: () => void;
  onQuickAnalyzeSample: (sampleId: string) => void;
}

const STATUS_TEXT: Record<HistoryEntry['status'], { label: string; cls: string }> = {
  conforme: { label: 'Conforme', cls: 'text-emerald-700 font-semibold' },
  'non-conforme': { label: 'Non conforme', cls: 'text-red-700 font-semibold' },
  'a-verifier': { label: 'À vérifier', cls: 'text-amber-700 font-semibold' },
};

export function DashboardView({
  history,
  hasReportForId,
  getReportById,
  privacyMode,
  onOpenReport,
  onDeleteHistoryItem,
  onGoImport,
  onGoOfflineInstall,
  onQuickAnalyzeSample,
}: DashboardViewProps) {
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [historySearchQuery, setHistorySearchQuery] = useState('');

  const filteredHistory = useMemo(() => {
    const q = historySearchQuery.trim().toLowerCase();
    if (!q) return history;
    return history.filter((h) => {
      const dateStr = new Date(h.analyzedAt).toLocaleString('fr-FR').toLowerCase();
      const nameStr = h.fileName.toLowerCase();
      const profileStr = h.profileName.toLowerCase();
      return nameStr.includes(q) || dateStr.includes(q) || profileStr.includes(q);
    });
  }, [history, historySearchQuery]);

  // Nettoie automatiquement la sélection si un élément est supprimé ou purgé
  useEffect(() => {
    const validIds = new Set(history.map((h) => h.id));
    setSelectedForCompare((prev) => {
      const next = prev.filter((id) => validIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [history]);

  const toggleCompareSelection = (id: string) => {
    setSelectedForCompare((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= 2) {
        return [prev[0], id];
      }
      return [...prev, id];
    });
  };

  const handleCompareLatestTwo = () => {
    if (history.length < 2) return;
    // A = avant-dernière (référence), B = la plus récente (comparée)
    setSelectedForCompare([history[1].id, history[0].id]);
  };

  const handleSwapComparison = () => {
    setSelectedForCompare((prev) => (prev.length === 2 ? [prev[1], prev[0]] : prev));
  };

  const totalControlled = history.length;
  const totalConforme = history.filter((h) => h.status === 'conforme').length;
  const totalNonConforme = history.filter((h) => h.status === 'non-conforme').length;
  const totalAnomalies = history.reduce((acc, h) => acc + h.totalAnomalies, 0);

  const canCompare = selectedForCompare.length === 2;

  return (
    <div className="space-y-8">
      {/* Page Heading */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-slate-200 pb-6">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Contrôle de conformité CCP — Algérie Poste
          </h1>
          <p className="text-sm text-slate-600 max-w-2xl">
            Vérification locale des fichiers de virement aux formats RIP (préfixe 00799999) et non-RIP
            (bourrage 00000000), avec séparation stricte des moteurs de règles et zéro transmission externe.
          </p>
        </div>
        <button
          type="button"
          onClick={onGoImport}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[#0F2942] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#163A5C] transition-colors whitespace-nowrap shrink-0"
        >
          <Upload className="h-4 w-4" />
          <span>Contrôler un fichier</span>
        </button>
      </div>

      {/* 4-column KPI strip (flat single-elevation cells with crisp hairline dividers) */}
      <section aria-label="Indicateurs de session">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border border-slate-200 bg-white divide-y sm:divide-y-0 sm:divide-x divide-slate-200 rounded-md overflow-hidden">
          <div className="p-5">
            <p className="text-xs font-medium text-slate-500">Fichiers contrôlés</p>
            <p className="mt-2 font-mono text-3xl font-semibold text-slate-900 tabular-nums">
              {totalControlled}
            </p>
            <p className="mt-1 text-xs text-slate-500">Session locale active</p>
          </div>
          <div className="p-5">
            <p className="text-xs font-medium text-slate-500">Fichiers conformes</p>
            <p className="mt-2 font-mono text-3xl font-semibold text-emerald-700 tabular-nums">
              {totalConforme}
            </p>
            <p className="mt-1 text-xs text-slate-500">Prêts pour transmission</p>
          </div>
          <div className="p-5">
            <p className="text-xs font-medium text-slate-500">Fichiers non conformes</p>
            <p className="mt-2 font-mono text-3xl font-semibold text-red-700 tabular-nums">
              {totalNonConforme}
            </p>
            <p className="mt-1 text-xs text-slate-500">Rejetés ou à corriger</p>
          </div>
          <div className="p-5">
            <p className="text-xs font-medium text-slate-500">Anomalies détectées</p>
            <p className="mt-2 font-mono text-3xl font-semibold text-slate-900 tabular-nums">
              {totalAnomalies}
            </p>
            <p className="mt-1 text-xs text-slate-500">Critiques, erreurs et alertes</p>
          </div>
        </div>
      </section>

      {/* Quick Verification of User's Real Provided Files + Invalid Fixtures */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Vérification rapide sur vos fichiers calibrés (62 caractères)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Lancez immédiatement une analyse sur vos fichiers réels RIP et non-RIP ou sur les jeux d’anomalies de démonstration.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {SAMPLE_FILES_CATALOG.map((sample) => (
            <div
              key={sample.id}
              className="flex items-start justify-between gap-4 rounded-md border border-slate-200 bg-white p-4 hover:border-slate-300 transition-colors"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-mono text-slate-700">
                    {sample.kind === 'rip' ? 'Format RIP' : 'Format non-RIP'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono truncate">{sample.name}</span>
                </div>
                <p className="text-sm font-semibold text-slate-900">{sample.label}</p>
                <p className="text-xs text-slate-600 leading-relaxed">{sample.description}</p>
              </div>
              <button
                type="button"
                onClick={() => onQuickAnalyzeSample(sample.id)}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 hover:bg-[#0F2942] hover:text-white hover:border-[#0F2942] transition-colors whitespace-nowrap shrink-0"
              >
                <span>Analyser</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Offline Installation Card for other PCs */}
      {onGoOfflineInstall && (
        <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="rounded-md bg-[#0F2942]/10 p-2.5 text-[#0F2942] shrink-0">
                <HardDriveDownload className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h2 className="text-sm font-semibold text-slate-900">
                  Déploiement hors-ligne sur un autre PC (Poste isolé / Clé USB)
                </h2>
                <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
                  Exportez l'application complète sans dépendance Internet pour l'installer sur n'importe quel ordinateur d'agence ou poste comptable non connecté. Comprend le lanceur Windows 1-clic (.bat), le serveur local portable LAN, les profils Algérie Poste et le guide d'installation PDF imprimable.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onGoOfflineInstall}
              className="inline-flex items-center gap-2 rounded-md bg-[#0F2942] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#163A5C] transition-colors whitespace-nowrap shrink-0"
            >
              <HardDriveDownload className="h-4 w-4" />
              <span>Pack hors-ligne & Guide</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </section>
      )}

      {/* History Table + Two-Analysis Comparison */}
      <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Historique des dernières analyses</h2>
            <p className="text-xs text-slate-500">
              {history.length >= 2
                ? 'Cochez deux analyses ci-dessous pour comparer leurs indicateurs et écarts de conformité.'
                : 'Conservé en mémoire de session uniquement (aucune persistance disque des fichiers sensibles).'}
            </p>
          </div>

          {history.length >= 2 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-mono text-slate-600 tabular-nums">
                Sélection : {selectedForCompare.length}/2
              </span>
              {selectedForCompare.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedForCompare([])}
                  className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
                >
                  Effacer
                </button>
              )}
              {!canCompare && (
                <button
                  type="button"
                  onClick={handleCompareLatestTwo}
                  className="inline-flex items-center gap-1.5 rounded bg-[#0F2942] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#163A5C] transition-colors whitespace-nowrap"
                >
                  <GitCompare className="h-3.5 w-3.5" />
                  <span>Comparer les 2 dernières</span>
                </button>
              )}
            </div>
          )}
        </div>

        {history.length === 0 ? (
          <div className="rounded-md border border-slate-200 bg-white px-6 py-12 text-center">
            <ShieldCheck className="mx-auto h-8 w-8 text-slate-400" />
            <h3 className="mt-3 text-sm font-semibold text-slate-900">
              Aucune analyse effectuée dans cette session
            </h3>
            <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
              Importez un fichier CCP (TXT 62 caractères, CSV ou Excel XLSX) ou testez l’un des fichiers
              exemples calibrés ci-dessus pour obtenir un rapport détaillé.
            </p>
            <button
              type="button"
              onClick={onGoImport}
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-[#0F2942] px-4 py-2 text-xs font-medium text-white hover:bg-[#163A5C] transition-colors"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Importer un premier fichier</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={historySearchQuery}
                onChange={(e) => setHistorySearchQuery(e.target.value)}
                placeholder="Rechercher par nom de fichier ou date..."
                className="w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-400"
              />
            </div>

            {filteredHistory.length === 0 ? (
              <div className="rounded-md border border-slate-200 bg-white px-6 py-8 text-center text-xs text-slate-500">
                Aucun historique ne correspond à la recherche « {historySearchQuery} ».
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-medium text-slate-600">
                    <tr>
                      <th className="px-3 py-3 w-16 text-center">Comparer</th>
                      <th className="px-4 py-3">Fichier</th>
                      <th className="px-4 py-3">Format / Profil</th>
                      <th className="px-4 py-3">Statut</th>
                      <th className="px-4 py-3 text-right">Bénéficiaires</th>
                      <th className="px-4 py-3 text-right">Montant calculé</th>
                      <th className="px-4 py-3 text-right">Anomalies</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredHistory.map((entry) => {
                  const st = STATUS_TEXT[entry.status];
                  const canOpen = hasReportForId(entry.id);
                  const selIdx = selectedForCompare.indexOf(entry.id);
                  const isSelected = selIdx !== -1;
                  const slotLabel = selIdx === 0 ? 'A' : selIdx === 1 ? 'B' : null;

                  return (
                    <tr
                      key={entry.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isSelected ? 'bg-[#0F2942]/5' : ''
                      }`}
                    >
                      <td className="px-3 py-3 text-center">
                        <label className="inline-flex items-center justify-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={history.length < 2}
                            onChange={() => toggleCompareSelection(entry.id)}
                            aria-label={`Sélectionner ${entry.fileName} pour la comparaison`}
                            className="rounded border-slate-400"
                          />
                          {slotLabel && (
                            <span className="font-mono text-[11px] font-bold text-[#0F2942]">
                              {slotLabel}
                            </span>
                          )}
                        </label>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 truncate max-w-[220px]">
                              {entry.fileName}
                            </p>
                            <p className="text-xs text-slate-500 font-mono tabular-nums">
                              {formatFileSize(entry.fileSize)} ·{' '}
                              {new Date(entry.analyzedAt).toLocaleTimeString('fr-FR', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-slate-800">
                            {entry.profileFormat === 'rip'
                              ? 'Format RIP (00799999)'
                              : entry.profileFormat === 'rib'
                                ? 'Format RIB Bancaire (Mod 97)'
                                : 'Format non-RIP (00000000)'}
                          </p>
                          <p className="text-xs text-slate-500 truncate max-w-[210px]">{entry.profileName}</p>
                          {entry.profileFormat === 'rib' && (() => {
                            const rep = getReportById(entry.id);
                            const ribRecords = rep?.records.filter((r) => r.bankRibDetails) ?? [];
                            const validCount = ribRecords.filter((r) => r.bankRibDetails?.validBankKey).length;
                            const totalRib = ribRecords.length;
                            const allValid = totalRib > 0 && validCount === totalRib;
                            const firstBankCode = ribRecords[0]?.bankRibDetails?.bankCode ?? '???';
                            const bankShort = findAlgerianBankByCode(firstBankCode)?.shortName;
                            const bankLabel = bankShort ? `${firstBankCode} (${bankShort})` : firstBankCode;
                            const firstCcpEq = ribRecords[0]?.bankRibDetails?.ccpEquivalent ?? '???';
                            const maskedCcpEq = maskAccountNumber(firstCcpEq, privacyMode);
                            const tooltipText = totalRib > 0
                              ? `Banque principale: ${bankLabel} · Clés Mod 97 valides: ${validCount}/${totalRib} · Équivalent CCP interne: ${maskedCcpEq}`
                              : 'Aucun détail RIB';
                            return (
                              <div className="group relative inline-block">
                                <span
                                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono font-medium cursor-help ${
                                    allValid
                                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                      : 'bg-red-100 text-red-800 border border-red-300'
                                  }`}
                                  title={tooltipText}
                                >
                                  {allValid ? `✓ RIB Mod 97 Validé (${validCount}/${totalRib})` : `⚠ RIB Clé Erronée (${validCount}/${totalRib})`}
                                </span>
                              </div>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs ${st.cls}`}>{st.label}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-slate-800 tabular-nums">
                        {entry.beneficiaryCount.toLocaleString('fr-FR')}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-slate-800 tabular-nums">
                        {formatDZD(entry.computedTotalCentimes)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                        <span
                          className={
                            entry.criticalCount + entry.errorCount > 0
                              ? 'text-red-700 font-semibold'
                              : entry.warningCount > 0
                                ? 'text-amber-700 font-medium'
                                : 'text-emerald-700'
                          }
                        >
                          {entry.totalAnomalies}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          {canOpen && (
                            <button
                              type="button"
                              onClick={() => onOpenReport(entry.id)}
                              className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-[#0F2942] hover:text-white hover:border-[#0F2942] transition-colors whitespace-nowrap"
                            >
                              Ouvrir
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onDeleteHistoryItem(entry.id)}
                            aria-label={`Supprimer ${entry.fileName} de l'historique`}
                            className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )}

        {/* Comparison Panel rendered whenever 2 analyses are selected */}
        {canCompare && (
          <AnalysisComparisonPanel
            history={history}
            selectedIdA={selectedForCompare[0]}
            selectedIdB={selectedForCompare[1]}
            getReportById={getReportById}
            privacyMode={privacyMode}
            onChangeA={(id) => setSelectedForCompare((prev) => [id, prev[1]])}
            onChangeB={(id) => setSelectedForCompare((prev) => [prev[0], id])}
            onSwap={handleSwapComparison}
            onClose={() => setSelectedForCompare([])}
            onOpenReport={onOpenReport}
          />
        )}
      </section>
    </div>
  );
}

