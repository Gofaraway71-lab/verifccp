import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Search,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import { AnalysisReport, Anomaly, Severity } from '../types/ccp';
import { formatDZD, formatFileSize, maskAccountNumber, maskSensitiveInText } from '../engine/cryptoKeys';
import {
  exportAnomaliesCSV,
  exportAnomaliesXLSX,
  exportInvalidLinesTXT,
  exportReportPDF,
  exportSafeCorrectedTXT,
  exportValidLinesTXT,
} from '../engine/exporters';
import {
  generateSimpleCompliancePdf,
  SimplePdfExportResult,
} from '../engine/simplePdfExporter';
import { LineInspector } from './LineInspector';
import { PdfReportModule } from './PdfReportModule';

interface ResultsViewProps {
  report: AnalysisReport | null;
  privacyMode: boolean;
  onGoImport: () => void;
  initialFilter?: AnomalyFilter;
}

type ResultSubTab = 'anomalies' | 'records' | 'correction' | 'pdf';
export type AnomalyFilter =
  | 'all'
  | 'critical'
  | 'error'
  | 'warning'
  | 'info'
  | 'rip'
  | 'non-rip'
  | 'rib'
  | 'duplicate'
  | 'field';

const SEVERITY_META: Record<Severity, { label: string; textCls: string }> = {
  critical: { label: 'Erreur critique', textCls: 'text-red-800 font-semibold' },
  error: { label: 'Erreur', textCls: 'text-red-700 font-medium' },
  warning: { label: 'Avertissement', textCls: 'text-amber-700 font-medium' },
  info: { label: 'Information', textCls: 'text-slate-600 font-medium' },
};

export function ResultsView({ report, privacyMode, onGoImport, initialFilter }: ResultsViewProps) {
  const [subTab, setSubTab] = useState<ResultSubTab>('anomalies');
  const [filter, setFilter] = useState<AnomalyFilter>(initialFilter ?? 'all');
  const [searchQuery, setSearchQuery] = useState('');
  const [recordFilter, setRecordFilter] = useState<'all' | 'valid' | 'invalid'>('all');
  const [inspectedLineNumber, setInspectedLineNumber] = useState<number | null>(1);
  const [confirmSafeExport, setConfirmSafeExport] = useState(false);
  const [simplePdfFeedback, setSimplePdfFeedback] = useState<SimplePdfExportResult | null>(null);

  useEffect(() => {
    if (initialFilter) {
      setFilter(initialFilter);
      setSubTab('anomalies');
    }
  }, [initialFilter, report?.id]);

  const filteredAnomalies = useMemo(() => {
    if (!report) return [];
    const q = searchQuery.trim().toLowerCase();

    return report.anomalies.filter((a: Anomaly) => {
      if (filter === 'critical' && a.severity !== 'critical') return false;
      if (filter === 'error' && a.severity !== 'error') return false;
      if (filter === 'warning' && a.severity !== 'warning') return false;
      if (filter === 'info' && a.severity !== 'info') return false;
      if (filter === 'rip' && a.formatScope !== 'rip' && a.category !== 'rip') return false;
      if (filter === 'non-rip' && a.formatScope !== 'non-rip' && a.category !== 'non-rip') return false;
      if (filter === 'rib' && a.formatScope !== 'rib') return false;
      if (filter === 'duplicate' && a.category !== 'duplicate') return false;
      if (
        filter === 'field' &&
        !['field', 'amount', 'key', 'structure'].includes(a.category)
      ) {
        return false;
      }

      if (q) {
        const lineStr = String(a.lineNumber);
        const rec = report.records.find((r) => r.lineNumber === a.lineNumber);
        const haystack = [
          lineStr,
          a.ruleCode,
          a.recordIdentifier,
          a.field,
          a.detectedValue,
          a.description,
          rec?.beneficiaryTrimmed ?? '',
          rec?.accountFull20 ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [report, filter, searchQuery]);

  const filteredRecords = useMemo(() => {
    if (!report) return [];
    const q = searchQuery.trim().toLowerCase();
    return report.records.filter((r) => {
      if (recordFilter === 'valid' && r.hasCriticalOrError) return false;
      if (recordFilter === 'invalid' && !r.hasCriticalOrError) return false;
      if (q) {
        const hay = [
          String(r.lineNumber),
          r.accountFull20 ?? '',
          r.beneficiaryTrimmed ?? '',
          r.amountRaw ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [report, recordFilter, searchQuery]);

  if (!report) {
    return (
      <div className="rounded-md border border-slate-200 bg-white px-6 py-16 text-center">
        <FileText className="mx-auto h-9 w-9 text-slate-400" />
        <h2 className="mt-3 text-base font-semibold text-slate-900">Aucun rapport actif</h2>
        <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
          Importez un fichier CCP ou sélectionnez une analyse depuis le tableau de bord pour afficher les résultats
          détaillés et exporter le rapport.
        </p>
        <button
          type="button"
          onClick={onGoImport}
          className="mt-5 inline-flex items-center gap-2 rounded-md bg-[#0F2942] px-4 py-2 text-sm font-medium text-white hover:bg-[#163A5C] transition-colors"
        >
          <span>Importer un fichier</span>
        </button>
      </div>
    );
  }

  const inspectedRecord =
    report.records.find((r) => r.lineNumber === inspectedLineNumber) ?? report.records[0] ?? null;

  const statusHeading =
    report.status === 'conforme'
      ? { label: 'Conforme', cls: 'text-emerald-700', Icon: CheckCircle2 }
      : report.status === 'a-verifier'
        ? { label: 'À vérifier', cls: 'text-amber-700', Icon: AlertTriangle }
        : { label: 'Non conforme', cls: 'text-red-700', Icon: ShieldAlert };

  const StatusIcon = statusHeading.Icon;

  const filterButtons: Array<{ id: AnomalyFilter; label: string; count: number }> = [
    { id: 'all', label: 'Toutes', count: report.anomalies.length },
    { id: 'critical', label: 'Critiques', count: report.summary.countsBySeverity.critical },
    { id: 'error', label: 'Erreurs', count: report.summary.countsBySeverity.error },
    { id: 'warning', label: 'Avertissements', count: report.summary.countsBySeverity.warning },
    { id: 'info', label: 'Infos', count: report.summary.countsBySeverity.info },
    {
      id: 'rip',
      label: 'Anomalies RIP',
      count: report.anomalies.filter((a) => a.formatScope === 'rip').length,
    },
    {
      id: 'non-rip',
      label: 'Anomalies non-RIP',
      count: report.anomalies.filter((a) => a.formatScope === 'non-rip').length,
    },
    ...(report.profileFormat === 'rib' || report.anomalies.some((a) => a.formatScope === 'rib')
      ? [
          {
            id: 'rib' as const,
            label: 'Anomalies RIB',
            count: report.anomalies.filter((a) => a.formatScope === 'rib').length,
          },
        ]
      : []),
    { id: 'duplicate', label: 'Doublons', count: report.summary.countsByCategory.duplicate },
    {
      id: 'field',
      label: 'Champs invalides',
      count:
        report.summary.countsByCategory.field +
        report.summary.countsByCategory.amount +
        report.summary.countsByCategory.key +
        report.summary.countsByCategory.structure,
    },
  ];

  const totalMatchesDeclared =
    report.summary.declaredTotalCentimes === null ||
    report.summary.declaredTotalCentimes === report.summary.computedTotalCentimes;

  return (
    <div className="space-y-6">
      {/* Header & Status Banner */}
      <div className="rounded-md border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              <span className="font-mono text-slate-700">
                {report.profileFormat === 'rip'
                  ? 'Format RIP (00799999)'
                  : report.profileFormat === 'rib'
                    ? 'Format RIB Bancaire (Mod 97)'
                    : 'Format non-RIP (00000000)'}
              </span>
              <span aria-hidden="true">·</span>
              <span>{report.profileName}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{formatFileSize(report.fileSize)}</span>
              <span aria-hidden="true">·</span>
              <span>{report.decoded.detectedEncoding}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{report.durationMs} ms</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-bold tracking-tight text-slate-900 truncate max-w-xl">
                {report.fileName}
              </h1>
              <span className={`inline-flex items-center gap-1.5 text-sm font-bold ${statusHeading.cls}`}>
                <StatusIcon className="h-4 w-4 shrink-0" />
                <span>{statusHeading.label}</span>
              </span>
            </div>
            {report.summary.ordonnateurAccount && (
              <p className="text-xs text-slate-600 font-mono tabular-nums">
                Ordonnateur (Ligne 1) : {maskAccountNumber(report.summary.ordonnateurAccount, privacyMode)}
                {report.summary.headerPeriod ? ` · Période : ${report.summary.headerPeriod}` : ''}
              </p>
            )}
          </div>

          {/* Export Toolbar */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => exportReportPDF(report, privacyMode)}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#0F2942] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#163A5C] transition-colors whitespace-nowrap shadow-sm"
              title="Générer un fichier PDF récapitulatif de l'analyse, incluant les détails et suggestions des anomalies détectées"
            >
              <FileText className="h-4 w-4" />
              <span>Rapport PDF récapitulatif & anomalies</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const res = generateSimpleCompliancePdf(report, { privacyMode });
                setSimplePdfFeedback(res);
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" />
              <span>PDF simple</span>
            </button>
            {filteredAnomalies.length !== report.anomalies.length && (
              <button
                type="button"
                onClick={() => {
                  const activeFilterLabel =
                    filterButtons.find((b) => b.id === filter)?.label ?? 'Filtre actif';
                  const res = generateSimpleCompliancePdf(report, {
                    privacyMode,
                    anomalies: filteredAnomalies,
                    filterLabel: searchQuery.trim()
                      ? `${activeFilterLabel} + recherche`
                      : activeFilterLabel,
                  });
                  setSimplePdfFeedback(res);
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                <Download className="h-3.5 w-3.5" />
                <span>PDF filtré ({filteredAnomalies.length})</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setSubTab('pdf')}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <span>Configurer PDF</span>
            </button>
            <button
              type="button"
              onClick={() => exportAnomaliesXLSX(report, privacyMode)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>Excel (.xlsx)</span>
            </button>
            <button
              type="button"
              onClick={() => exportAnomaliesCSV(report, privacyMode)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" />
              <span>CSV</span>
            </button>
            <button
              type="button"
              onClick={() => exportValidLinesTXT(report)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <span>Lignes conformes</span>
            </button>
            {report.summary.invalidRecords > 0 && (
              <button
                type="button"
                onClick={() => exportInvalidLinesTXT(report)}
                className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800 hover:bg-red-100 transition-colors whitespace-nowrap"
              >
                <span>Lignes non conformes</span>
              </button>
            )}
          </div>
        </div>

        {simplePdfFeedback && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-900 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
              <span className="truncate">
                Rapport PDF simple généré : <strong className="font-mono">{simplePdfFeedback.fileName}</strong> (
                {simplePdfFeedback.pageCount} page(s) · {simplePdfFeedback.anomalyCount} anomalie(s)).
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSimplePdfFeedback(null)}
              className="text-emerald-800 hover:underline shrink-0"
            >
              Fermer
            </button>
          </div>
        )}

        {report.profileMismatchWarning && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
            <span>
              Avertissement de profil : la détection automatique indiquait «{' '}
              {report.detection.detectedFormat === 'ambiguous'
                ? 'format mixte / ambigu'
                : report.detection.detectedFormat}
              » alors que le contrôle a été exécuté avec le profil « {report.profileFormat} ». Vérifiez les
              anomalies de préfixe ci-dessous.
            </span>
          </div>
        )}
      </div>

      {/* 5-Metric Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 border border-slate-200 bg-white divide-y sm:divide-y-0 sm:divide-x divide-slate-200 rounded-md overflow-hidden">
        <div className="p-4">
          <p className="text-xs text-slate-500">Enregistrements</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {report.summary.nonEmptyLines.toLocaleString('fr-FR')}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {report.summary.beneficiaryCount.toLocaleString('fr-FR')} bénéficiaire(s)
            {report.summary.declaredBeneficiaryCount !== null
              ? ` / ${report.summary.declaredBeneficiaryCount} déclaré(s)`
              : ''}
          </p>
        </div>

        <div className="p-4">
          <p className="text-xs text-slate-500">Lignes valides</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold text-emerald-700 tabular-nums">
            {report.summary.validRecords.toLocaleString('fr-FR')}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {report.summary.warningRecords > 0
              ? `dont ${report.summary.warningRecords} avec avertissement`
              : 'Sans erreur bloquante'}
          </p>
        </div>

        <div className="p-4">
          <p className="text-xs text-slate-500">Lignes invalides</p>
          <p
            className={`mt-1.5 font-mono text-2xl font-semibold tabular-nums ${
              report.summary.invalidRecords > 0 ? 'text-red-700' : 'text-slate-900'
            }`}
          >
            {report.summary.invalidRecords.toLocaleString('fr-FR')}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            Doublons : {report.summary.duplicateAccounts} · Répétées : {report.summary.repeatedLines}
          </p>
        </div>

        <div className="p-4">
          <p className="text-xs text-slate-500">Total des montants</p>
          <p className="mt-1.5 font-mono text-xl font-semibold text-slate-900 tabular-nums">
            {formatDZD(report.summary.computedTotalCentimes)}
          </p>
          <p
            className={`mt-1 text-xs font-mono tabular-nums ${
              totalMatchesDeclared ? 'text-emerald-700' : 'text-red-700 font-semibold'
            }`}
          >
            {report.summary.declaredTotalCentimes !== null
              ? totalMatchesDeclared
                ? 'Égal au montant global Ligne 1'
                : `Déclaré L1 : ${formatDZD(report.summary.declaredTotalCentimes)}`
              : 'Somme des lignes bénéficiaires'}
          </p>
        </div>

        <div className="p-4">
          <p className="text-xs text-slate-500">Anomalies</p>
          <p
            className={`mt-1.5 font-mono text-2xl font-semibold tabular-nums ${
              report.anomalies.length > 0 ? 'text-red-700' : 'text-emerald-700'
            }`}
          >
            {report.anomalies.length.toLocaleString('fr-FR')}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {report.summary.countsBySeverity.critical} crit. · {report.summary.countsBySeverity.error} err. ·{' '}
            {report.summary.countsBySeverity.warning} avert.
          </p>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200">
        <div className="flex items-center gap-6" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'anomalies'}
            onClick={() => setSubTab('anomalies')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              subTab === 'anomalies'
                ? 'border-[#0F2942] text-[#0F2942]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Anomalies détaillées ({report.anomalies.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'records'}
            onClick={() => setSubTab('records')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              subTab === 'records'
                ? 'border-[#0F2942] text-[#0F2942]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Enregistrements et inspecteur ({report.records.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'correction'}
            onClick={() => setSubTab('correction')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              subTab === 'correction'
                ? 'border-[#0F2942] text-[#0F2942]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Correction sûre et comparateur
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'pdf'}
            onClick={() => setSubTab('pdf')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              subTab === 'pdf'
                ? 'border-[#0F2942] text-[#0F2942]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Rapport PDF
          </button>
        </div>

        {(subTab === 'anomalies' || subTab === 'records') && (
          <div className="relative mb-2 w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher RIP, CCP, nom ou n° ligne..."
              className="w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400"
            />
          </div>
        )}
      </div>

      {/* TAB 1 : ANOMALIES */}
      {subTab === 'anomalies' && (
        <div className="space-y-4">
          {/* Interactive Filter Bar */}
          <div className="flex flex-wrap items-center gap-1.5">
            {filterButtons.map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => setFilter(btn.id)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  filter === btn.id
                    ? 'bg-[#0F2942] text-white'
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {btn.label} ({btn.count})
              </button>
            ))}
          </div>

          {filteredAnomalies.length === 0 ? (
            <div className="rounded-md border border-slate-200 bg-white px-6 py-12 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
              <h3 className="mt-3 text-sm font-semibold text-slate-900">
                {report.anomalies.length === 0
                  ? 'Aucune anomalie détectée sur ce fichier'
                  : 'Aucune anomalie ne correspond aux filtres sélectionnés'}
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                {report.anomalies.length === 0
                  ? 'Tous les contrôles actifs du profil ont été validés avec succès.'
                  : 'Modifiez votre recherche ou réinitialisez les filtres pour afficher toutes les anomalies.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-50 font-medium text-slate-600">
                  <tr>
                    <th className="px-3 py-3 w-16">Ligne</th>
                    <th className="px-3 py-3">Gravité</th>
                    <th className="px-3 py-3">Identifiant / Champ</th>
                    <th className="px-3 py-3">Valeur détectée</th>
                    <th className="px-3 py-3">Règle attendue</th>
                    <th className="px-3 py-3">Description et suggestion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAnomalies.slice(0, 500).map((a) => {
                    const sev = SEVERITY_META[a.severity];
                    const isSelected = a.lineNumber > 0 && inspectedLineNumber === a.lineNumber;
                    return (
                      <tr
                        key={a.id}
                        onClick={() => {
                          if (a.lineNumber > 0) setInspectedLineNumber(a.lineNumber);
                        }}
                        className={`transition-colors ${
                          a.lineNumber > 0 ? 'cursor-pointer hover:bg-slate-50' : ''
                        } ${isSelected ? 'bg-[#0F2942]/5' : ''}`}
                      >
                        <td className="px-3 py-3 font-mono font-semibold text-slate-900 tabular-nums align-top">
                          {a.lineNumber === 0 ? 'Global' : a.lineNumber}
                        </td>
                        <td className="px-3 py-3 align-top whitespace-nowrap">
                          <span className={sev.textCls}>{sev.label}</span>
                          <p className="mt-0.5 font-mono text-[11px] text-slate-400">{a.ruleCode}</p>
                        </td>
                        <td className="px-3 py-3 align-top">
                          <p className="font-medium text-slate-900">{a.field}</p>
                          <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                            {maskAccountNumber(a.recordIdentifier, privacyMode)}
                          </p>
                        </td>
                        <td className="px-3 py-3 align-top font-mono text-red-800 max-w-[180px] break-all">
                          {maskSensitiveInText(a.detectedValue, privacyMode)}
                        </td>
                        <td className="px-3 py-3 align-top text-slate-700 max-w-[190px]">
                          {a.expectedRule}
                        </td>
                        <td className="px-3 py-3 align-top max-w-md space-y-1">
                          <p className="text-slate-800 leading-relaxed">
                            {maskSensitiveInText(a.description, privacyMode)}
                          </p>
                          {a.suggestion && (
                            <p className="text-[11px] text-slate-500">
                              Suggestion : {a.suggestion}
                            </p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredAnomalies.length > 500 && (
                <div className="border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
                  Affichage limité aux 500 premières anomalies pour la fluidité. Exportez en Excel (.xlsx) ou
                  CSV pour consulter les {filteredAnomalies.length.toLocaleString('fr-FR')} anomalies.
                </div>
              )}
            </div>
          )}

          {/* Contextual 62-char Line Inspector right below when fixed-62 */}
          {report.structure === 'fixed-62' && inspectedRecord && (
            <div className="rounded-md border border-slate-200 bg-white p-4">
              <LineInspector
                record={inspectedRecord}
                formatKind={report.profileFormat}
                privacyMode={privacyMode}
              />
            </div>
          )}
        </div>
      )}

      {/* TAB 2 : RECORDS & INSPECTOR */}
      {subTab === 'records' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              {(['all', 'valid', 'invalid'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setRecordFilter(k)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    recordFilter === k
                      ? 'bg-[#0F2942] text-white'
                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {k === 'all' && `Toutes les lignes (${report.records.length})`}
                  {k === 'valid' && `Valides (${report.summary.validRecords})`}
                  {k === 'invalid' && `Invalides (${report.summary.invalidRecords})`}
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-500">
              Cliquez sur une ligne pour disséquer ses positions exactes
            </span>
          </div>

          {report.structure === 'fixed-62' && inspectedRecord && (
            <div className="rounded-md border border-slate-200 bg-white p-4">
              <LineInspector
                record={inspectedRecord}
                formatKind={report.profileFormat}
                privacyMode={privacyMode}
              />
            </div>
          )}

          <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 font-medium text-slate-600">
                <tr>
                  <th className="px-3 py-2.5 w-16">Ligne</th>
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5">Compte / RIP</th>
                  <th className="px-3 py-2.5">Bénéficiaire / Période</th>
                  <th className="px-3 py-2.5 text-right">Montant</th>
                  <th className="px-3 py-2.5 text-right">Long.</th>
                  <th className="px-3 py-2.5">État</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.slice(0, 300).map((r) => (
                  <tr
                    key={r.lineNumber}
                    onClick={() => setInspectedLineNumber(r.lineNumber)}
                    className={`cursor-pointer hover:bg-slate-50 transition-colors ${
                      inspectedLineNumber === r.lineNumber ? 'bg-[#0F2942]/5' : ''
                    }`}
                  >
                    <td className="px-3 py-2.5 font-mono font-semibold text-slate-900 tabular-nums">
                      {r.lineNumber}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">
                      {r.kind === 'header' && 'En-tête (0)'}
                      {r.kind === 'detail' && 'Bénéficiaire (1)'}
                      {r.kind === 'empty' && 'Vide'}
                      {r.kind === 'malformed' && 'Mal formé'}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-900 tabular-nums">
                      {r.accountFull20 ? maskAccountNumber(r.accountFull20, privacyMode) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-slate-800">
                      {r.kind === 'header'
                        ? `Nb: ${r.declaredCountRaw ?? '—'} · Période: ${r.monthRaw ?? '??'}/${r.yearRaw ?? '????'}`
                        : r.beneficiaryTrimmed || '(vide)'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-900 tabular-nums">
                      {r.amountCentimes !== undefined ? formatDZD(r.amountCentimes) : r.amountRaw ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-600">
                      {r.lineLength}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {r.hasCriticalOrError ? (
                        <span className="text-red-700 font-semibold">
                          Invalide ({r.anomalyIds.length})
                        </span>
                      ) : r.hasWarning ? (
                        <span className="text-amber-700 font-medium">
                          Avertissement ({r.anomalyIds.length})
                        </span>
                      ) : (
                        <span className="text-emerald-700 font-medium">Valide</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredRecords.length > 300 && (
              <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
                Affichage des 300 premiers enregistrements sur {filteredRecords.length.toLocaleString('fr-FR')}.
                Utilisez la recherche ci-dessus pour cibler un compte ou une ligne précise.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3 : SAFE CORRECTION & ORIGINAL VS CORRECTED DIFF */}
      {subTab === 'correction' && (
        <div className="space-y-4">
          <div className="rounded-md border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-[#0F2942]" />
                  <span>Nettoyage technique sûr (sans altération métier)</span>
                </h2>
                <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
                  Par sécurité bancaire, aucun numéro CCP, RIP, clé de contrôle, montant ou nom de bénéficiaire
                  n’est jamais modifié automatiquement. Seules les corrections techniques sûres sont proposées :
                  suppression du BOM UTF-8, suppression des caractères invisibles et lignes vides, normalisation
                  des fins de ligne ({report.safeCorrection.targetLineEnding}).
                </p>
              </div>
            </div>

            {!report.safeCorrection.hasChanges ? (
              <div className="rounded border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
                <span>
                  Aucune correction technique automatique n’est nécessaire (encodage, BOM, fins de ligne et
                  lignes vides sont déjà propres).
                </span>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded border border-slate-200 bg-slate-50 p-4 space-y-1.5">
                  <p className="text-xs font-semibold text-slate-800">
                    Opérations techniques proposées ({report.safeCorrection.summary.length}) :
                  </p>
                  <ul className="list-disc list-inside text-xs text-slate-700 space-y-1">
                    {report.safeCorrection.summary.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>

                {/* Side-by-side comparison */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-slate-700">
                      Fichier original intact (extrait 20 lignes)
                    </p>
                    <pre className="overflow-x-auto rounded border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] text-slate-800 leading-relaxed max-h-64">
                      {maskSensitiveInText(
                        report.originalRawText.split(/\r\n|\n|\r/).slice(0, 20).join('\n'),
                        privacyMode
                      )}
                    </pre>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-slate-700">
                      Fichier nettoyé proposé (extrait 20 lignes)
                    </p>
                    <pre className="overflow-x-auto rounded border border-emerald-200 bg-emerald-50/40 p-3 font-mono text-[11px] text-slate-900 leading-relaxed max-h-64">
                      {maskSensitiveInText(
                        report.safeCorrection.correctedContent.split(/\r\n|\n|\r/).slice(0, 20).join('\n'),
                        privacyMode
                      )}
                    </pre>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-200 pt-4">
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmSafeExport}
                      onChange={(e) => setConfirmSafeExport(e.target.checked)}
                      className="rounded border-slate-400"
                    />
                    <span>
                      J’ai vérifié la comparaison ci-dessus et je valide le téléchargement du fichier nettoyé
                    </span>
                  </label>
                  <button
                    type="button"
                    disabled={!confirmSafeExport}
                    onClick={() => exportSafeCorrectedTXT(report)}
                    className="inline-flex items-center gap-2 rounded-md bg-[#0F2942] px-4 py-2 text-xs font-medium text-white hover:bg-[#163A5C] disabled:opacity-45 transition-colors whitespace-nowrap"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Télécharger le fichier nettoyé</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4 : DEDICATED PDF REPORT GENERATOR MODULE */}
      {subTab === 'pdf' && (
        <PdfReportModule
          report={report}
          filteredAnomalies={filteredAnomalies}
          globalPrivacyMode={privacyMode}
        />
      )}
    </div>
  );
}
