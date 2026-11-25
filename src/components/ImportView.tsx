import React, { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, Play, Upload, XCircle } from 'lucide-react';
import { DecodedFileResult, FormatDetectionResult, ValidationProfile } from '../types/ccp';
import { formatFileSize } from '../engine/cryptoKeys';
import { decodeRawStringAsFile, readAndDecodeFile } from '../engine/fileParser';
import { detectFileFormat } from '../engine/formatDetector';
import { SAMPLE_FILES_CATALOG } from '../engine/samplesAndTests';

interface StagedFile {
  id: string;
  file?: File;
  decoded: DecodedFileResult;
  detection: FormatDetectionResult;
  selectedProfileId: string;
  encodingOverride: 'AUTO' | 'UTF-8' | 'Windows-1252' | 'Windows-1256';
}

interface ImportViewProps {
  profiles: ValidationProfile[];
  onRunValidation: (
    decoded: DecodedFileResult,
    detection: FormatDetectionResult,
    profile: ValidationProfile,
    onProgress: (processed: number, total: number) => void,
    signal: AbortSignal
  ) => Promise<void>;
}

export function ImportView({ profiles, onRunValidation }: ImportViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [activeStagedId, setActiveStagedId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState({ processed: 0, total: 0 });
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [confirmMismatch, setConfirmMismatch] = useState(false);

  const activeStaged = stagedFiles.find((f) => f.id === activeStagedId) ?? stagedFiles[0] ?? null;

  const chooseInitialProfile = (detection: FormatDetectionResult): string => {
    if (detection.suggestedProfileId && profiles.some((p) => p.id === detection.suggestedProfileId)) {
      return detection.suggestedProfileId;
    }
    return profiles[0]?.id ?? 'ap-rip-fixed-62';
  };

  const handleFilesAdded = async (fileList: FileList | File[]) => {
    setStatusMessage(null);
    setConfirmMismatch(false);
    const arr = Array.from(fileList);
    if (arr.length === 0) return;

    const newStaged: StagedFile[] = [];
    for (const file of arr) {
      const decoded = await readAndDecodeFile(file, 'AUTO');
      const detection = detectFileFormat(decoded);
      newStaged.push({
        id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        file,
        decoded,
        detection,
        selectedProfileId: chooseInitialProfile(detection),
        encodingOverride: 'AUTO',
      });
    }

    setStagedFiles((prev) => [...newStaged, ...prev]);
    setActiveStagedId(newStaged[0].id);
  };

  const handleLoadSample = (sampleId: string) => {
    const sample = SAMPLE_FILES_CATALOG.find((s) => s.id === sampleId);
    if (!sample) return;
    setStatusMessage(null);
    setConfirmMismatch(false);
    const decoded = decodeRawStringAsFile(sample.name, sample.content);
    const detection = detectFileFormat(decoded);
    const staged: StagedFile = {
      id: `sample-${sample.id}-${Date.now()}`,
      decoded,
      detection,
      selectedProfileId:
        detection.suggestedProfileId && profiles.some((p) => p.id === detection.suggestedProfileId)
          ? detection.suggestedProfileId
          : sample.kind === 'rip'
            ? 'ap-rip-fixed-62'
            : 'ap-nonrip-fixed-62',
      encodingOverride: 'AUTO',
    };
    setStagedFiles((prev) => [staged, ...prev]);
    setActiveStagedId(staged.id);
  };

  const handleEncodingChange = async (
    stagedId: string,
    enc: 'AUTO' | 'UTF-8' | 'Windows-1252' | 'Windows-1256'
  ) => {
    const target = stagedFiles.find((f) => f.id === stagedId);
    if (!target || !target.file) return;
    const decoded = await readAndDecodeFile(target.file, enc);
    const detection = detectFileFormat(decoded);
    setStagedFiles((prev) =>
      prev.map((item) =>
        item.id === stagedId ? { ...item, decoded, detection, encodingOverride: enc } : item
      )
    );
  };

  const handleProfileChange = (stagedId: string, profileId: string) => {
    setConfirmMismatch(false);
    setStagedFiles((prev) =>
      prev.map((item) => (item.id === stagedId ? { ...item, selectedProfileId: profileId } : item))
    );
  };

  const handleRemoveStaged = (stagedId: string) => {
    setStagedFiles((prev) => {
      const next = prev.filter((i) => i.id !== stagedId);
      if (activeStagedId === stagedId) {
        setActiveStagedId(next[0]?.id ?? null);
      }
      return next;
    });
  };

  const selectedProfile = activeStaged
    ? profiles.find((p) => p.id === activeStaged.selectedProfileId) ?? profiles[0]
    : null;

  const isFormatConflict =
    !!activeStaged &&
    !!selectedProfile &&
    activeStaged.detection.detectedFormat !== 'unknown' &&
    activeStaged.detection.detectedFormat !== 'ambiguous' &&
    activeStaged.detection.detectedFormat !== selectedProfile.formatKind;

  const isLowConfidence = !!activeStaged && activeStaged.detection.confidence < 75;

  const handleLaunchAnalysis = async () => {
    if (!activeStaged || !selectedProfile) return;
    if ((isFormatConflict || activeStaged.detection.detectedFormat === 'ambiguous') && !confirmMismatch) {
      setStatusMessage(
        'Attention : confirmez explicitement le profil sélectionné avant de lancer la validation (écart ou ambiguïté détecté).'
      );
      return;
    }

    setStatusMessage(null);
    setIsAnalyzing(true);
    setProgress({ processed: 0, total: activeStaged.decoded.rawLines.length });
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await onRunValidation(
        activeStaged.decoded,
        activeStaged.detection,
        selectedProfile,
        (processed, total) => setProgress({ processed, total }),
        controller.signal
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setStatusMessage('Analyse annulée par l’utilisateur.');
      } else {
        setStatusMessage(
          `Erreur durant l’analyse : ${err instanceof Error ? err.message : 'erreur inconnue'}.`
        );
      }
    } finally {
      setIsAnalyzing(false);
      abortRef.current = null;
    }
  };

  const handleCancelAnalysis = () => {
    abortRef.current?.abort();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) {
      void handleFilesAdded(e.dataTransfer.files);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Importer et détecter un fichier CCP
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Détection automatique du format RIP (00799999), non-RIP (00000000) ou RIB bancaire (001, 002, 003...), de la structure, de l’encodage
          et du séparateur. Le fichier d’origine n’est jamais modifié.
        </p>
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`rounded-md border-2 border-dashed p-8 text-center transition-colors ${
          isDragging
            ? 'border-[#0F2942] bg-[#0F2942]/5'
            : 'border-slate-300 bg-white hover:border-slate-400'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".txt,.csv,.tsv,.xlsx,.xls,.ccp,.dat"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) {
              void handleFilesAdded(e.target.files);
              e.target.value = '';
            }
          }}
        />
        <Upload className="mx-auto h-9 w-9 text-slate-400" />
        <h2 className="mt-3 text-base font-semibold text-slate-900">
          Glissez-déposez vos fichiers CCP ici
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Formats pris en charge : TXT largeur fixe 62 car. · CSV · TSV · Excel (.xlsx) · Encodage UTF-8, Windows-1252, Windows-1256 (arabe)
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-md bg-[#0F2942] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#163A5C] transition-colors whitespace-nowrap"
          >
            <Upload className="h-4 w-4" />
            <span>Sélectionner des fichiers</span>
          </button>
          <span className="text-xs text-slate-400">ou charger un fichier d’essai :</span>
          {SAMPLE_FILES_CATALOG.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => handleLoadSample(s.id)}
              className="rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Multi-file queue if more than 1 staged */}
      {stagedFiles.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
          <span className="text-xs font-medium text-slate-500 mr-1">
            Fichiers chargés ({stagedFiles.length}) :
          </span>
          {stagedFiles.map((item) => {
            const isSel = activeStaged?.id === item.id;
            return (
              <div
                key={item.id}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs ${
                  isSel
                    ? 'border-[#0F2942] bg-[#0F2942] text-white'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveStagedId(item.id);
                    setConfirmMismatch(false);
                  }}
                  className="font-medium max-w-[180px] truncate"
                >
                  {item.decoded.fileName}
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveStaged(item.id)}
                  aria-label={`Retirer ${item.decoded.fileName}`}
                  className="opacity-70 hover:opacity-100"
                >
                  <XCircle className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Detection & Profile Confirmation Panel */}
      {activeStaged && selectedProfile && (
        <div className="rounded-md border border-slate-200 bg-white divide-y divide-slate-200">
          {/* File Metadata Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-5">
            <div className="flex items-start gap-3 min-w-0">
              <FileText className="h-5 w-5 text-[#0F2942] mt-0.5 shrink-0" />
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-slate-900 truncate">
                  {activeStaged.decoded.fileName}
                </h3>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 font-mono tabular-nums">
                  <span>{formatFileSize(activeStaged.decoded.fileSize)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{activeStaged.decoded.rawLines.length.toLocaleString('fr-FR')} lignes</span>
                  <span aria-hidden="true">·</span>
                  <span>Encodage : {activeStaged.decoded.detectedEncoding}</span>
                  <span aria-hidden="true">·</span>
                  <span>Fins de ligne : {activeStaged.decoded.lineEnding}</span>
                </div>
              </div>
            </div>

            {activeStaged.file && activeStaged.decoded.extension !== 'xlsx' && (
              <div className="flex items-center gap-2 shrink-0">
                <label htmlFor="encoding-select" className="text-xs text-slate-600 whitespace-nowrap">
                  Encodage :
                </label>
                <select
                  id="encoding-select"
                  value={activeStaged.encodingOverride}
                  onChange={(e) =>
                    void handleEncodingChange(
                      activeStaged.id,
                      e.target.value as StagedFile['encodingOverride']
                    )
                  }
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
                >
                  <option value="AUTO">Automatique</option>
                  <option value="UTF-8">UTF-8</option>
                  <option value="Windows-1252">Windows-1252 (ANSI FR)</option>
                  <option value="Windows-1256">Windows-1256 (Arabe ANSI)</option>
                </select>
              </div>
            )}
          </div>

          {/* Automatic Detection Summary Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-slate-700">Détection automatique</h4>
                <span className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
                  Confiance : {activeStaged.detection.confidence} %
                </span>
              </div>

              {/* Confidence bar */}
              <div className="h-2 w-full rounded-sm bg-slate-100 overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    activeStaged.detection.confidence >= 85
                      ? 'bg-emerald-600'
                      : activeStaged.detection.confidence >= 60
                        ? 'bg-amber-500'
                        : 'bg-red-600'
                  }`}
                  style={{ width: `${activeStaged.detection.confidence}%` }}
                />
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                <div>
                  <dt className="text-slate-500">Format détecté</dt>
                  <dd className="mt-0.5 font-semibold text-slate-900">
                    {activeStaged.detection.detectedFormat === 'rip' && 'Format RIP (00799999)'}
                    {activeStaged.detection.detectedFormat === 'non-rip' && 'Format non-RIP (00000000)'}
                    {activeStaged.detection.detectedFormat === 'rib' && 'Format RIB Bancaire (Mod 97)'}
                    {activeStaged.detection.detectedFormat === 'ambiguous' && 'Ambigu / Mixte (vérification requise)'}
                    {activeStaged.detection.detectedFormat === 'unknown' && 'Non reconnu'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Structure</dt>
                  <dd className="mt-0.5 font-semibold text-slate-900">
                    {activeStaged.detection.detectedStructure === 'fixed-62' && 'Largeur fixe (62 car.)'}
                    {activeStaged.detection.detectedStructure === 'delimited' &&
                      `Délimité (${activeStaged.detection.delimiter === '\t' ? 'Tab' : activeStaged.detection.delimiter}) · ${activeStaged.detection.columnCount} col.`}
                    {activeStaged.detection.detectedStructure === 'spreadsheet' &&
                      `Tableur Excel · ${activeStaged.detection.columnCount} col.`}
                    {activeStaged.detection.detectedStructure === 'unknown' && 'Inconnue'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Lignes préfixe RIP (00799999)</dt>
                  <dd className="mt-0.5 font-mono text-slate-900 tabular-nums">
                    {activeStaged.detection.ripPrefixCount.toLocaleString('fr-FR')}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">
                    {(activeStaged.detection.ribPrefixCount ?? 0) > 0
                      ? 'Lignes RIB bancaire (001..038)'
                      : 'Lignes préfixe non-RIP (00000000)'}
                  </dt>
                  <dd className="mt-0.5 font-mono text-slate-900 tabular-nums">
                    {(activeStaged.detection.ribPrefixCount ?? 0) > 0
                      ? (activeStaged.detection.ribPrefixCount ?? 0).toLocaleString('fr-FR')
                      : activeStaged.detection.nonRipPrefixCount.toLocaleString('fr-FR')}
                  </dd>
                </div>
              </dl>

              <ul className="space-y-1 text-xs text-slate-600 pt-1">
                {activeStaged.detection.reasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>

              {activeStaged.detection.warnings.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-1">
                  {activeStaged.detection.warnings.map((w, i) => (
                    <p key={i} className="flex items-start gap-2 text-xs text-amber-900">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-700 mt-0.5 shrink-0" />
                      <span>{w}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>

            {/* Manual Profile Selection & Launch */}
            <div className="p-5 flex flex-col justify-between space-y-5">
              <div className="space-y-3">
                <label htmlFor="profile-select" className="block text-xs font-semibold text-slate-700">
                  Profil de validation à appliquer
                </label>
                <select
                  id="profile-select"
                  value={activeStaged.selectedProfileId}
                  onChange={(e) => handleProfileChange(activeStaged.id, e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900"
                >
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.formatKind === 'rip' ? 'RIP' : p.formatKind === 'rib' ? 'RIB Bancaire' : 'non-RIP'}] {p.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-600 leading-relaxed">{selectedProfile.description}</p>
                <div className="text-xs text-slate-500">
                  <span>
                    Moteur isolé :{' '}
                    <strong className="text-slate-800">
                      {selectedProfile.formatKind === 'rip'
                        ? 'Module RIP'
                        : selectedProfile.formatKind === 'rib'
                          ? 'Module RIB Bancaire'
                          : 'Module non-RIP'}
                    </strong>
                  </span>
                  <span className="mx-2" aria-hidden="true">·</span>
                  <span>
                    Clés :{' '}
                    <strong className="text-slate-800">
                      {selectedProfile.detailKeyAlgorithm === 'ccp-or-rip'
                        ? 'Clé CCP ou Clé RIP'
                        : selectedProfile.detailKeyAlgorithm === 'bank-rib-mod97'
                          ? 'Clé RIB Bancaire (Mod 97)'
                          : selectedProfile.detailKeyAlgorithm === 'rip-mod97-85'
                            ? 'Clé RIP uniquement (strict)'
                            : selectedProfile.detailKeyAlgorithm === 'ccp-weighted'
                              ? 'Clé CCP uniquement (strict)'
                              : selectedProfile.detailKeyAlgorithm === 'rip-mod97-std'
                                ? 'Mod 97 std (strict)'
                                : 'Désactivé'}
                    </strong>
                  </span>
                  <span className="mx-2" aria-hidden="true">·</span>
                  <span>
                    {selectedProfile.rules.filter((r) => r.enabled).length} règles actives
                  </span>
                </div>

                {/* Explicit mismatch/low-confidence safeguard */}
                {(isFormatConflict || activeStaged.detection.detectedFormat === 'ambiguous' || isLowConfidence) && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3.5 space-y-2.5">
                    <div className="flex items-start gap-2 text-xs text-red-900">
                      <AlertTriangle className="h-4 w-4 text-red-700 shrink-0 mt-0.5" />
                      <p>
                        {isFormatConflict
                          ? `Alerte de sécurité : le fichier est détecté comme ${
                              activeStaged.detection.detectedFormat === 'rip'
                                ? 'RIP'
                                : activeStaged.detection.detectedFormat === 'rib'
                                  ? 'RIB Bancaire'
                                  : 'non-RIP'
                            }, mais vous avez sélectionné un profil ${
                              selectedProfile.formatKind === 'rip'
                                ? 'RIP'
                                : selectedProfile.formatKind === 'rib'
                                  ? 'RIB Bancaire'
                                  : 'non-RIP'
                            }. Les règles incompatibles seront signalées.`
                          : 'La détection automatique n’est pas certaine (format mixte ou structure atypique). Vérifiez le profil choisi avant d’exécuter le contrôle.'}
                      </p>
                    </div>
                    <label className="flex items-center gap-2 text-xs font-medium text-red-900 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={confirmMismatch}
                        onChange={(e) => setConfirmMismatch(e.target.checked)}
                        className="rounded border-red-400"
                      />
                      <span>Je confirme vouloir analyser ce fichier avec le profil sélectionné</span>
                    </label>
                  </div>
                )}
              </div>

              {/* Progress bar + Action button */}
              <div className="space-y-3">
                {isAnalyzing && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-slate-600 font-mono tabular-nums">
                      <span>Analyse en cours...</span>
                      <span>
                        {progress.processed.toLocaleString('fr-FR')} /{' '}
                        {progress.total.toLocaleString('fr-FR')} lignes
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-sm bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-[#0F2942] transition-all"
                        style={{
                          width: `${
                            progress.total > 0
                              ? Math.min(100, Math.round((progress.processed / progress.total) * 100))
                              : 100
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {statusMessage && (
                  <p className="text-xs font-medium text-red-700">{statusMessage}</p>
                )}

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={isAnalyzing}
                    onClick={() => void handleLaunchAnalysis()}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-[#0F2942] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#163A5C] disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    <Play className="h-4 w-4" />
                    <span>{isAnalyzing ? 'Contrôle en cours...' : 'Lancer le contrôle de conformité'}</span>
                  </button>
                  {isAnalyzing && (
                    <button
                      type="button"
                      onClick={handleCancelAnalysis}
                      className="rounded-md border border-red-300 bg-white px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 transition-colors whitespace-nowrap"
                    >
                      Annuler
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Raw Preview (first 5 lines, read-only) */}
          <div className="p-5 bg-slate-50/70">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-slate-700">
                Aperçu brut en lecture seule (5 premières lignes)
              </h4>
              <span className="text-[11px] font-mono text-slate-500">
                Fichier source intact · non modifié
              </span>
            </div>
            <div className="overflow-x-auto rounded border border-slate-200 bg-white p-3 font-mono text-xs text-slate-800 leading-relaxed">
              {activeStaged.decoded.rawLines.slice(0, 5).map((line, idx) => (
                <div key={idx} className="flex items-baseline gap-3 whitespace-pre">
                  <span className="w-7 text-right text-slate-400 select-none tabular-nums">
                    {idx + 1}
                  </span>
                  <span className="text-slate-900">{line || '(ligne vide)'}</span>
                  <span className="text-[11px] text-slate-400 select-none tabular-nums">
                    [{line.length} car.]
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
