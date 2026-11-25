import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, Eye, FileText, ShieldCheck } from 'lucide-react';
import { AnalysisReport, Anomaly, AnomalyCategory, Severity } from '../types/ccp';
import { formatDZD, formatFileSize, maskAccountNumber, maskSensitiveInText } from '../engine/cryptoKeys';
import {
  buildComplianceReportPdfBlob,
  GeneratedPdfResult,
  PdfReportOptions,
  triggerPdfDownload,
} from '../engine/pdfReportGenerator';

interface PdfReportModuleProps {
  report: AnalysisReport;
  filteredAnomalies: Anomaly[];
  globalPrivacyMode: boolean;
}

const SEVERITY_LABELS: Record<Severity, { label: string; barCls: string; textCls: string }> = {
  critical: { label: 'Erreurs critiques', barCls: 'bg-red-700', textCls: 'text-red-800' },
  error: { label: 'Erreurs', barCls: 'bg-red-500', textCls: 'text-red-700' },
  warning: { label: 'Avertissements', barCls: 'bg-amber-600', textCls: 'text-amber-700' },
  info: { label: 'Informations', barCls: 'bg-sky-600', textCls: 'text-sky-700' },
};

const CATEGORY_LABELS: Record<AnomalyCategory, string> = {
  structure: 'Structure (longueur, *, type)',
  rip: 'Format RIP (00799999)',
  'non-rip': 'Format non-RIP (00000000)',
  key: 'Clés de contrôle (RIP / CCP)',
  amount: 'Montants',
  coherence: 'Cohérence globale (totaux / nb)',
  duplicate: 'Doublons et lignes répétées',
  field: 'Champs (période, noms, espaces)',
  encoding: 'Encodage, BOM et fins de ligne',
};

export function PdfReportModule({
  report,
  filteredAnomalies,
  globalPrivacyMode,
}: PdfReportModuleProps) {
  const [scope, setScope] = useState<'all' | 'filtered'>('all');
  const [includeStatsBreakdown, setIncludeStatsBreakdown] = useState(true);
  const [includeSuggestions, setIncludeSuggestions] = useState(true);
  const [includeDetectionDetails, setIncludeDetectionDetails] = useState(true);
  const [maskAccountsInPdf, setMaskAccountsInPdf] = useState(globalPrivacyMode);
  const [organizationName, setOrganizationName] = useState('');
  const [operatorNote, setOperatorNote] = useState('');
  const [previewMode, setPreviewMode] = useState<'structured' | 'native-pdf'>('structured');
  const [lastDownloadName, setLastDownloadName] = useState<string | null>(null);

  useEffect(() => {
    setMaskAccountsInPdf(globalPrivacyMode);
  }, [globalPrivacyMode]);

  const activeAnomalies = scope === 'filtered' ? filteredAnomalies : report.anomalies;

  const pdfOptions: PdfReportOptions = useMemo(
    () => ({
      privacyMode: maskAccountsInPdf,
      scope,
      includeStatsBreakdown,
      includeSuggestions,
      includeDetectionDetails,
      organizationName,
      operatorNote,
    }),
    [
      maskAccountsInPdf,
      scope,
      includeStatsBreakdown,
      includeSuggestions,
      includeDetectionDetails,
      organizationName,
      operatorNote,
    ]
  );

  const generatedPdf: GeneratedPdfResult = useMemo(
    () => buildComplianceReportPdfBlob(report, activeAnomalies, pdfOptions),
    [report, activeAnomalies, pdfOptions]
  );

  const [pdfObjectUrl, setPdfObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (previewMode !== 'native-pdf') {
      setPdfObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(generatedPdf.blob);
    setPdfObjectUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [generatedPdf.blob, previewMode]);

  const handleDownload = () => {
    triggerPdfDownload(generatedPdf);
    setLastDownloadName(generatedPdf.fileName);
  };

  const complianceRate =
    report.summary.nonEmptyLines > 0
      ? ((report.summary.validRecords / report.summary.nonEmptyLines) * 100).toFixed(1)
      : '0.0';

  const totalAnomaliesDivisor = Math.max(1, report.anomalies.length);
  const nonZeroCategories = (Object.keys(CATEGORY_LABELS) as AnomalyCategory[]).filter(
    (c) => report.summary.countsByCategory[c] > 0
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Configuration Column */}
      <div className="lg:col-span-5 rounded-md border border-slate-200 bg-white p-5 space-y-5">
        <div className="space-y-1 border-b border-slate-200 pb-4">
          <h2 className="text-base font-semibold text-slate-900">
            Générateur de rapport PDF
          </h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            Configurez le contenu du rapport institutionnel PDF (généré 100 % localement, prêt pour archivage
            administratif ou transmission interne).
          </p>
        </div>

        {/* Scope Selector */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-700">Périmètre des anomalies à inclure</p>
          <div className="grid grid-cols-2 gap-1.5 rounded-md bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setScope('all')}
              className={`rounded px-2.5 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                scope === 'all'
                  ? 'bg-white text-[#0F2942] shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Toutes ({report.anomalies.length})
            </button>
            <button
              type="button"
              onClick={() => setScope('filtered')}
              className={`rounded px-2.5 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                scope === 'filtered'
                  ? 'bg-white text-[#0F2942] shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Filtre actif ({filteredAnomalies.length})
            </button>
          </div>
        </div>

        {/* Content Checkboxes */}
        <div className="space-y-2.5">
          <p className="text-xs font-semibold text-slate-700">Sections et confidentialité</p>
          <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={includeStatsBreakdown}
              onChange={(e) => setIncludeStatsBreakdown(e.target.checked)}
              className="mt-0.5 rounded border-slate-400"
            />
            <span>Inclure les statistiques détaillées (gravités, catégories et taux de conformité)</span>
          </label>
          <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={includeSuggestions}
              onChange={(e) => setIncludeSuggestions(e.target.checked)}
              className="mt-0.5 rounded border-slate-400"
            />
            <span>Inclure les suggestions de correction pour chaque anomalie</span>
          </label>
          <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={includeDetectionDetails}
              onChange={(e) => setIncludeDetectionDetails(e.target.checked)}
              className="mt-0.5 rounded border-slate-400"
            />
            <span>Inclure les détails de détection automatique et d’encodage</span>
          </label>
          <label className="flex items-start gap-2.5 text-xs text-slate-800 font-medium cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={maskAccountsInPdf}
              onChange={(e) => setMaskAccountsInPdf(e.target.checked)}
              className="mt-0.5 rounded border-slate-400"
            />
            <span>Masquer les numéros CCP/RIP dans le PDF (mode confidentialité)</span>
          </label>
        </div>

        {/* Administrative Metadata Inputs */}
        <div className="space-y-3 border-t border-slate-200 pt-4">
          <div>
            <label htmlFor="pdf-org" className="block text-xs font-medium text-slate-700 mb-1">
              Organisme / Service émetteur (optionnel)
            </label>
            <input
              id="pdf-org"
              type="text"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              placeholder="Ex. Direction des Finances — Service Paie"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400"
            />
          </div>
          <div>
            <label htmlFor="pdf-note" className="block text-xs font-medium text-slate-700 mb-1">
              Observation / Visa du contrôleur (optionnel)
            </label>
            <textarea
              id="pdf-note"
              rows={2}
              value={operatorNote}
              onChange={(e) => setOperatorNote(e.target.value)}
              placeholder="Ex. Lot vérifié avant dépôt au centre des chèques postaux..."
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* Summary & Primary Download Action */}
        <div className="border-t border-slate-200 pt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 font-mono tabular-nums">
            <span>
              {generatedPdf.pageCount} page(s) · {formatFileSize(generatedPdf.sizeBytes)}
            </span>
            <span>{generatedPdf.includedAnomaliesCount} anomalie(s) incluse(s)</span>
          </div>

          <button
            type="button"
            onClick={handleDownload}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[#0F2942] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#163A5C] transition-colors whitespace-nowrap"
          >
            <Download className="h-4 w-4" />
            <span>Télécharger le rapport PDF</span>
          </button>

          {lastDownloadName && (
            <p className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Téléchargé : {lastDownloadName}</span>
            </p>
          )}
        </div>
      </div>

      {/* Document Preview Column */}
      <div className="lg:col-span-7 rounded-md border border-slate-200 bg-white overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
            <FileText className="h-4 w-4 text-[#0F2942]" />
            <span>Aperçu du rapport PDF</span>
          </div>

          <div className="flex items-center gap-1 rounded bg-slate-200/70 p-0.5">
            <button
              type="button"
              onClick={() => setPreviewMode('structured')}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                previewMode === 'structured'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Aperçu structuré
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode('native-pdf')}
              className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                previewMode === 'native-pdf'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Eye className="h-3 w-3" />
              <span>Rendu PDF</span>
            </button>
          </div>
        </div>

        {previewMode === 'native-pdf' && pdfObjectUrl ? (
          <div className="p-4 bg-slate-100">
            <iframe
              title="Aperçu du rapport PDF généré"
              src={pdfObjectUrl}
              className="h-[640px] w-full rounded border border-slate-300 bg-white"
            />
          </div>
        ) : (
          <div className="p-6 space-y-6 bg-white">
            {/* Simulated A4 Paper Header */}
            <div className="rounded bg-[#0F2942] px-5 py-4 text-white">
              <p className="font-display text-sm font-bold">
                VérifCCP — Rapport de Conformité CCP Algérie Poste
              </p>
              <p className="mt-1 text-[11px] text-slate-300 font-mono">
                {report.fileName} · {report.profileFormat === 'rip' ? 'Format RIP (00799999)' : report.profileFormat === 'rib' ? 'Format RIB Bancaire (Mod 97)' : 'Format non-RIP (00000000)'} ·{' '}
                {new Date(report.analyzedAt).toLocaleString('fr-FR')}
              </p>
              {organizationName.trim() && (
                <p className="mt-1 text-[11px] text-amber-200">{organizationName.trim()}</p>
              )}
            </div>

            {/* Verdict + Core Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="rounded border border-slate-200 bg-slate-50/70 p-3">
                <p className="text-[11px] text-slate-500">Statut général</p>
                <p
                  className={`mt-1 font-bold ${
                    report.status === 'conforme'
                      ? 'text-emerald-700'
                      : report.status === 'a-verifier'
                        ? 'text-amber-700'
                        : 'text-red-700'
                  }`}
                >
                  {report.status === 'conforme'
                    ? 'Conforme'
                    : report.status === 'a-verifier'
                      ? 'À vérifier'
                      : 'Non conforme'}
                </p>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50/70 p-3">
                <p className="text-[11px] text-slate-500">Taux conformité</p>
                <p className="mt-1 font-mono font-semibold text-slate-900 tabular-nums">
                  {complianceRate} %
                </p>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50/70 p-3">
                <p className="text-[11px] text-slate-500">Montant calculé</p>
                <p className="mt-1 font-mono font-semibold text-slate-900 tabular-nums">
                  {formatDZD(report.summary.computedTotalCentimes)}
                </p>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50/70 p-3">
                <p className="text-[11px] text-slate-500">Anomalies incluses</p>
                <p className="mt-1 font-mono font-semibold text-slate-900 tabular-nums">
                  {activeAnomalies.length}
                </p>
              </div>
            </div>

            {/* Stats Breakdown Preview */}
            {includeStatsBreakdown && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 border-t border-slate-200 pt-4">
                <div className="space-y-2.5">
                  <p className="text-xs font-semibold text-slate-800">Répartition par gravité</p>
                  {(Object.keys(SEVERITY_LABELS) as Severity[]).map((sev) => {
                    const count = report.summary.countsBySeverity[sev];
                    const pct = report.anomalies.length > 0 ? Math.round((count / totalAnomaliesDivisor) * 100) : 0;
                    const meta = SEVERITY_LABELS[sev];
                    return (
                      <div key={sev} className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-600">{meta.label}</span>
                          <span className={`font-mono font-semibold tabular-nums ${meta.textCls}`}>
                            {count} ({pct} %)
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-sm bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full ${meta.barCls}`}
                            style={{ width: `${count > 0 ? Math.max(4, pct) : 0}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-800">Répartition par catégorie</p>
                  {nonZeroCategories.length === 0 ? (
                    <p className="text-xs text-emerald-700 flex items-center gap-1.5 pt-1">
                      <ShieldCheck className="h-4 w-4" />
                      <span>Aucune catégorie en anomalie.</span>
                    </p>
                  ) : (
                    <dl className="divide-y divide-slate-100 text-xs">
                      {nonZeroCategories.map((cat) => (
                        <div key={cat} className="flex items-center justify-between py-1.5">
                          <dt className="text-slate-600">{CATEGORY_LABELS[cat]}</dt>
                          <dd className="font-mono font-semibold text-slate-900 tabular-nums">
                            {report.summary.countsByCategory[cat]}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              </div>
            )}

            {/* Anomalies Table Excerpt Preview */}
            <div className="border-t border-slate-200 pt-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-800">
                  Extrait de la table des anomalies ({activeAnomalies.length} au total)
                </p>
                {activeAnomalies.length > 6 && (
                  <span className="text-[11px] text-slate-500">
                    6 premières lignes affichées ici · toutes incluses dans le PDF
                  </span>
                )}
              </div>

              {activeAnomalies.length === 0 ? (
                <p className="text-xs text-emerald-700">
                  Aucune anomalie dans le périmètre sélectionné.
                </p>
              ) : (
                <div className="overflow-x-auto rounded border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-[11px]">
                    <thead className="bg-slate-50 font-semibold text-slate-700">
                      <tr>
                        <th className="px-2.5 py-2">Ligne</th>
                        <th className="px-2.5 py-2">Code</th>
                        <th className="px-2.5 py-2">Champ / Compte</th>
                        <th className="px-2.5 py-2">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeAnomalies.slice(0, 6).map((a) => (
                        <tr key={a.id}>
                          <td className="px-2.5 py-2 font-mono font-semibold tabular-nums align-top">
                            {a.lineNumber === 0 ? 'GLOB' : a.lineNumber}
                          </td>
                          <td className="px-2.5 py-2 font-mono text-slate-600 align-top whitespace-nowrap">
                            {a.ruleCode}
                          </td>
                          <td className="px-2.5 py-2 align-top">
                            <p className="font-medium text-slate-800">{a.field}</p>
                            <p className="font-mono text-[10px] text-slate-500">
                              {maskAccountNumber(a.recordIdentifier, maskAccountsInPdf)}
                            </p>
                          </td>
                          <td className="px-2.5 py-2 text-slate-700 align-top">
                            <p>{maskSensitiveInText(a.description, maskAccountsInPdf)}</p>
                            {includeSuggestions && a.suggestion && (
                              <p className="mt-0.5 text-[10px] text-slate-500">
                                Suggestion : {a.suggestion}
                              </p>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {operatorNote.trim() && (
              <div className="border-t border-slate-200 pt-3">
                <p className="text-xs font-semibold text-slate-800">Observation du contrôleur</p>
                <p className="mt-1 text-xs text-slate-600 whitespace-pre-wrap">{operatorNote.trim()}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
