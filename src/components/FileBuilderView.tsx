import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Copy, Download, FilePlus2, Plus, Trash2, Zap } from 'lucide-react';
import {
  BuilderBeneficiaryRow,
  FileBuilderConfig,
  generateCcpPaymentFile,
} from '../engine/fileBuilder';
import { AnalysisReport, ValidationProfile } from '../types/ccp';
import { decodeRawStringAsFile } from '../engine/fileParser';
import { detectFileFormat } from '../engine/formatDetector';
import { analyzeDecodedFile } from '../engine/analyzer';
import { formatDZD, maskAccountNumber } from '../engine/cryptoKeys';

interface FileBuilderViewProps {
  profiles: ValidationProfile[];
  onCommitReport: (report: AnalysisReport) => void;
  privacyMode: boolean;
}

const INITIAL_BENEFICIARIES: BuilderBeneficiaryRow[] = [
  {
    id: 'row-1',
    account: '0000300076',
    amountDZD: '80000',
    beneficiaryName: 'KALKOUL ABDERRAHMANE',
  },
  {
    id: 'row-2',
    account: '0009396759',
    amountDZD: '40000',
    beneficiaryName: 'TALBI KHIER',
  },
];

export function FileBuilderView({ profiles, onCommitReport, privacyMode }: FileBuilderViewProps) {
  const [formatKind, setFormatKind] = useState<'rip' | 'non-rip'>('rip');
  const [ordonnateurAccount, setOrdonnateurAccount] = useState('00005040');
  const [month, setMonth] = useState('11');
  const [year, setYear] = useState('2026');
  const [lineEnding, setLineEnding] = useState<'CRLF' | 'LF'>('CRLF');
  const [beneficiaries, setBeneficiaries] = useState<BuilderBeneficiaryRow[]>(INITIAL_BENEFICIARIES);
  const [copied, setCopied] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const config: FileBuilderConfig = useMemo(
    () => ({
      formatKind,
      ordonnateurAccount,
      month,
      year,
      lineEnding,
      beneficiaries,
    }),
    [formatKind, ordonnateurAccount, month, year, lineEnding, beneficiaries]
  );

  const result = useMemo(() => generateCcpPaymentFile(config), [config]);

  const handleAddRow = () => {
    const newId = `row-${Date.now()}`;
    setBeneficiaries((prev) => [
      ...prev,
      {
        id: newId,
        account: '',
        amountDZD: '10000',
        beneficiaryName: '',
      },
    ]);
  };

  const handleRemoveRow = (id: string) => {
    setBeneficiaries((prev) => prev.filter((r) => r.id !== id));
  };

  const handleUpdateRow = (id: string, field: keyof BuilderBeneficiaryRow, value: string) => {
    setBeneficiaries((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  const handleLoadSample = () => {
    setFormatKind('rip');
    setOrdonnateurAccount('00005040');
    setMonth('11');
    setYear('2026');
    setBeneficiaries([
      {
        id: 's-1',
        account: '0000300076',
        amountDZD: '80000',
        beneficiaryName: 'KALKOUL ABDERRAHMANE',
      },
      {
        id: 's-2',
        account: '0009396759',
        amountDZD: '40000',
        beneficiaryName: 'TALBI KHIER',
      },
      {
        id: 's-3',
        account: '0004509479',
        amountDZD: '25000',
        beneficiaryName: 'BENALI MOHAMED',
      },
    ]);
  };

  const handleDownloadTxt = () => {
    if (!result.isValid) return;
    const blob = new Blob([result.generatedContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `paiement_ccp_${formatKind}_${year}_${month}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(result.generatedContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const handleAnalyzeGeneratedFile = async () => {
    if (!result.isValid) return;
    setAnalyzing(true);
    try {
      const fileName = `paiement_ccp_${formatKind}_${year}_${month}.txt`;
      const decoded = decodeRawStringAsFile(fileName, result.generatedContent);
      const detection = detectFileFormat(decoded);
      const targetProfileId = formatKind === 'rip' ? 'ap-rip-fixed-62' : 'ap-nonrip-fixed-62';
      const profile = profiles.find((p) => p.id === targetProfileId) ?? profiles[0];
      const report = await analyzeDecodedFile(decoded, detection, profile);
      onCommitReport(report);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Créateur de fichier CCP de paiement
          </h1>
          <p className="mt-1 text-sm text-slate-600 max-w-2xl">
            Générez un fichier de virement Algérie Poste au format largeur fixe (62 caractères) conforme,
            avec contrôle instantané des clés et des champs, et exportez le résultat au format texte.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleLoadSample}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <Zap className="h-3.5 w-3.5 text-amber-500" />
            <span>Charger un exemple type</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Form Configuration & Beneficiaries */}
        <div className="lg:col-span-7 space-y-6">
          {/* General Parameters */}
          <div className="rounded-md border border-slate-200 bg-white p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900">
              1. Paramètres généraux de l’en-tête (Ligne 1)
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">Format de virement</label>
                <div className="inline-flex items-center gap-1 rounded-md bg-slate-100 p-1 w-full">
                  <button
                    type="button"
                    onClick={() => setFormatKind('rip')}
                    className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                      formatKind === 'rip' ? 'bg-[#0F2942] text-white shadow-sm' : 'text-slate-700 hover:text-slate-900'
                    }`}
                  >
                    RIP (00799999)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormatKind('non-rip')}
                    className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                      formatKind === 'non-rip' ? 'bg-[#0F2942] text-white shadow-sm' : 'text-slate-700 hover:text-slate-900'
                    }`}
                  >
                    non-RIP (00000000)
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="builder-ord-account" className="block text-xs font-semibold text-slate-700">
                  Compte Ordonnateur (CCP 10 ch.)
                </label>
                <input
                  id="builder-ord-account"
                  type="text"
                  maxLength={10}
                  value={ordonnateurAccount}
                  onChange={(e) => setOrdonnateurAccount(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="Ex. 00005040"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 tabular-nums"
                />
                <p className="text-[11px] text-slate-500 font-mono">
                  Clé ordonnateur calculée : <strong className="text-slate-900">{result.ordonnateurKey}</strong>
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">Période (Mois / Année)</label>
                <div className="flex items-center gap-2">
                  <select
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    className="rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900"
                  >
                    {Array.from({ length: 12 }, (_, i) => {
                      const m = String(i + 1).padStart(2, '0');
                      return (
                        <option key={m} value={m}>
                          {m} — {['Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'][i]}
                        </option>
                      );
                    })}
                  </select>
                  <input
                    type="text"
                    maxLength={4}
                    value={year}
                    onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="w-24 rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 tabular-nums"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">Fins de ligne (Encodage)</label>
                <select
                  value={lineEnding}
                  onChange={(e) => setLineEnding(e.target.value as 'CRLF' | 'LF')}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 font-medium"
                >
                  <option value="CRLF">Windows (CRLF — recommandé Algérie Poste)</option>
                  <option value="LF">Unix / Linux (LF)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Beneficiaries List */}
          <div className="rounded-md border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  2. Liste des bénéficiaires ({beneficiaries.length})
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Chaque ligne génère un enregistrement de type 1 de 62 caractères.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddRow}
                className="inline-flex items-center gap-1.5 rounded bg-[#0F2942] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#163A5C] transition-colors whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Ajouter un bénéficiaire</span>
              </button>
            </div>

            <div className="space-y-3">
              {beneficiaries.map((b, idx) => (
                <div key={b.id} className="rounded border border-slate-200 bg-slate-50/60 p-3.5 space-y-3">
                  <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                    <span>Bénéficiaire #{idx + 1} (Ligne {idx + 2})</span>
                    {beneficiaries.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(b.id)}
                        className="text-red-600 hover:text-red-800 p-1"
                        title="Supprimer ce bénéficiaire"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                    <div className="sm:col-span-5 space-y-1">
                      <label className="block text-[11px] font-semibold text-slate-700">Compte CCP (10 ch.)</label>
                      <input
                        type="text"
                        maxLength={20}
                        value={b.account}
                        onChange={(e) => handleUpdateRow(b.id, 'account', e.target.value)}
                        placeholder="Ex. 300076"
                        className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 tabular-nums"
                      />
                    </div>

                    <div className="sm:col-span-3 space-y-1">
                      <label className="block text-[11px] font-semibold text-slate-700">Montant (DA)</label>
                      <input
                        type="text"
                        value={b.amountDZD}
                        onChange={(e) => handleUpdateRow(b.id, 'amountDZD', e.target.value)}
                        placeholder="Ex. 15000"
                        className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 tabular-nums"
                      />
                    </div>

                    <div className="sm:col-span-4 space-y-1">
                      <label className="block text-[11px] font-semibold text-slate-700">Nom & Prénom (27 car.)</label>
                      <input
                        type="text"
                        maxLength={27}
                        value={b.beneficiaryName}
                        onChange={(e) => handleUpdateRow(b.id, 'beneficiaryName', e.target.value)}
                        placeholder="Ex. KALKOUL ABDERRAHMANE"
                        className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 uppercase text-xs font-medium text-slate-900"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={handleAddRow}
              className="w-full dashed border-2 border-dashed border-slate-300 rounded-md py-2.5 text-xs font-medium text-slate-600 hover:border-slate-400 hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Ajouter un autre bénéficiaire</span>
            </button>
          </div>
        </div>

        {/* Right Column: Live Validation & Text Preview */}
        <div className="lg:col-span-5 space-y-6">
          {/* Validation Status Card */}
          <div className="rounded-md border border-slate-200 bg-white p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900">3. Contrôle des champs & Conformité</h2>

            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="rounded bg-slate-50 p-2.5 border border-slate-200">
                <span className="block text-[11px] font-sans text-slate-500">Bénéficiaires</span>
                <span className="text-base font-bold text-slate-900">{result.totalBeneficiaries}</span>
              </div>
              <div className="rounded bg-slate-50 p-2.5 border border-slate-200">
                <span className="block text-[11px] font-sans text-slate-500">Montant total</span>
                <span className="text-sm font-bold text-[#0F2942]">
                  {formatDZD(result.totalCentimes)}
                </span>
              </div>
            </div>

            {result.errors.length > 0 ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-3.5 space-y-2 text-xs text-red-900">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertCircle className="h-4 w-4 text-red-700 shrink-0" />
                  <span>{result.errors.length} erreur(s) à corriger :</span>
                </div>
                <ul className="space-y-1 list-disc list-inside text-red-800">
                  {result.errors.map((err, i) => (
                    <li key={i}>{err.message}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-900 flex items-center gap-2.5 font-medium">
                <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
                <span>Tous les champs sont valides ! Le fichier est prêt à être exporté.</span>
              </div>
            )}

            {result.warnings.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3.5 space-y-1.5 text-xs text-amber-900">
                <p className="font-semibold">Avertissements ({result.warnings.length}) :</p>
                <ul className="space-y-1 list-disc list-inside">
                  {result.warnings.map((w, i) => (
                    <li key={i}>{w.message}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Text Output Preview & Actions */}
          <div className="rounded-md border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">4. Aperçu du fichier texte généré</h2>
              <span className="font-mono text-[11px] text-slate-500">62 car. / ligne</span>
            </div>

            <div className="relative">
              <pre className="max-h-60 overflow-y-auto rounded bg-slate-900 p-3.5 font-mono text-[11px] text-slate-100 whitespace-pre-wrap break-all tabular-nums leading-relaxed">
                {privacyMode ? maskAccountNumber(result.generatedContent, true) : result.generatedContent}
              </pre>
            </div>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                disabled={!result.isValid}
                onClick={handleDownloadTxt}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[#0F2942] px-4 py-2.5 text-xs font-medium text-white hover:bg-[#163A5C] disabled:opacity-45 transition-colors whitespace-nowrap"
              >
                <Download className="h-4 w-4" />
                <span>Exporter le fichier TXT (.txt)</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={!result.isValid}
                  onClick={handleCopyText}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-45 transition-colors whitespace-nowrap"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>{copied ? 'Copié !' : 'Copier le texte'}</span>
                </button>

                <button
                  type="button"
                  disabled={!result.isValid || analyzing}
                  onClick={() => void handleAnalyzeGeneratedFile()}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-45 transition-colors whitespace-nowrap"
                >
                  <FilePlus2 className="h-3.5 w-3.5 text-emerald-700" />
                  <span>{analyzing ? 'Analyse...' : 'Vérifier ce fichier'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
