import React, { useRef, useState } from 'react';
import { Copy, Download, RotateCcw, Trash2, Upload } from 'lucide-react';
import { KeyAlgorithm, Severity, ValidationProfile } from '../types/ccp';
import { cloneProfileAsCustom } from '../engine/profiles';

interface ProfilesViewProps {
  profiles: ValidationProfile[];
  onChangeProfiles: (profiles: ValidationProfile[]) => void;
  onResetDefaults: () => void;
}

const KEY_ALGO_LABELS: Record<KeyAlgorithm, string> = {
  'ccp-or-rip': 'Algérie Poste — Clé CCP ou Clé RIP acceptée (recommandé)',
  'rip-mod97-85': 'Mode strict — Clé RIP Mod 97 + 85 uniquement',
  'ccp-weighted': 'Mode strict — Clé CCP (Poids 4..13 mod 100) uniquement',
  'rip-mod97-std': 'Mode strict — Clé RIB/RIP Mod 97 standard (18 chiffres)',
  'bank-rib-mod97': 'Clé RIB Bancaire Algérienne (Mod 97 avec conversion CCP)',
  none: 'Désactivé (aucun contrôle mathématique)',
};

export function ProfilesView({
  profiles,
  onChangeProfiles,
  onResetDefaults,
}: ProfilesViewProps) {
  const [selectedId, setSelectedId] = useState<string>(profiles[0]?.id ?? '');
  const [notice, setNotice] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const selected = profiles.find((p) => p.id === selectedId) ?? profiles[0];

  const updateSelected = (updater: (p: ValidationProfile) => ValidationProfile) => {
    if (!selected) return;
    onChangeProfiles(profiles.map((p) => (p.id === selected.id ? updater(p) : p)));
  };

  const handleDuplicate = () => {
    if (!selected) return;
    const copy = cloneProfileAsCustom(selected, `${selected.name} — Personnalisé`);
    onChangeProfiles([...profiles, copy]);
    setSelectedId(copy.id);
    setNotice(`Profil personnalisé « ${copy.name} » créé.`);
  };

  const handleDeleteCustom = (id: string) => {
    const target = profiles.find((p) => p.id === id);
    if (!target || target.isBuiltIn) return;
    const next = profiles.filter((p) => p.id !== id);
    onChangeProfiles(next);
    setSelectedId(next[0]?.id ?? '');
    setNotice(`Profil « ${target.name} » supprimé.`);
  };

  const handleExportBackup = () => {
    const payload = JSON.stringify(
      {
        schema: 'verifccp-profiles-v1',
        exportedAt: new Date().toISOString(),
        profiles,
      },
      null,
      2
    );
    const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `verifccp_configuration_profils_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Configuration des profils sauvegardée au format JSON.');
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const imported: ValidationProfile[] = Array.isArray(parsed) ? parsed : parsed?.profiles;
      if (!Array.isArray(imported) || imported.length === 0 || !imported[0].rules) {
        setNotice('Fichier JSON invalide : aucun profil VérifCCP détecté.');
        return;
      }
      onChangeProfiles(imported);
      setSelectedId(imported[0].id);
      setNotice(`${imported.length} profil(s) restauré(s) avec succès.`);
    } catch {
      setNotice('Impossible de lire le fichier JSON de sauvegarde.');
    } finally {
      e.target.value = '';
    }
  };

  if (!selected) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Profils de validation et règles configurables
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Adaptez chaque règle RIP ou non-RIP, activez ou désactivez les contrôles, ajustez leur gravité et
            sauvegardez la configuration de votre service sans modifier le code.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <input
            ref={importInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => void handleImportBackup(e)}
          />
          <button
            type="button"
            onClick={handleExportBackup}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Sauvegarder JSON</span>
          </button>
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Restaurer JSON</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onResetDefaults();
              setNotice('Profils par défaut restaurés.');
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Réinitialiser</span>
          </button>
        </div>
      </div>

      {notice && (
        <div className="rounded-md border border-slate-200 bg-white px-4 py-2.5 text-xs font-medium text-slate-800 flex items-center justify-between">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-slate-400 hover:text-slate-700">
            Fermer
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Profile Selector */}
        <div className="lg:col-span-4 space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-semibold text-slate-700">Profils disponibles ({profiles.length})</h2>
            <button
              type="button"
              onClick={handleDuplicate}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#0F2942] hover:underline"
            >
              <Copy className="h-3 w-3" />
              <span>Dupliquer</span>
            </button>
          </div>

          <div className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white overflow-hidden">
            {profiles.map((p) => {
              const active = p.id === selected.id;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={`p-3.5 cursor-pointer transition-colors ${
                    active ? 'bg-[#0F2942] text-white' : 'bg-white text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className={active ? 'text-amber-300 font-mono' : 'text-slate-500 font-mono'}>
                      {p.formatKind === 'rip'
                        ? 'RIP'
                        : p.formatKind === 'rib'
                          ? 'RIB Bancaire'
                          : 'non-RIP'}{' '}
                      ·{' '}
                      {p.structure === 'fixed-62' ? 'Fixe 62 car.' : 'Tabulaire'}
                    </span>
                    <span className={active ? 'text-slate-300' : 'text-slate-400'}>
                      {p.isVerifiedOnSample ? 'Calibré sur réel' : p.isBuiltIn ? 'Modèle' : 'Personnalisé'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-semibold leading-snug">{p.name}</p>
                  <p className={`mt-1 text-xs ${active ? 'text-slate-300' : 'text-slate-500'}`}>
                    {p.rules.filter((r) => r.enabled).length} / {p.rules.length} règles actives
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Profile Editor */}
        <div className="lg:col-span-8 space-y-6">
          <div className="rounded-md border border-slate-200 bg-white p-5 space-y-5">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  value={selected.name}
                  onChange={(e) => updateSelected((p) => ({ ...p, name: e.target.value }))}
                  className="w-full rounded border border-slate-300 px-3 py-1.5 text-base font-semibold text-slate-900"
                />
                <textarea
                  rows={2}
                  value={selected.description}
                  onChange={(e) => updateSelected((p) => ({ ...p, description: e.target.value }))}
                  className="w-full rounded border border-slate-200 px-3 py-1.5 text-xs text-slate-600"
                />
              </div>
              {!selected.isBuiltIn && (
                <button
                  type="button"
                  onClick={() => handleDeleteCustom(selected.id)}
                  className="inline-flex items-center gap-1 rounded border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 whitespace-nowrap"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Supprimer</span>
                </button>
              )}
            </div>

            {/* Technical parameters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Algorithme de clé (Bénéficiaires)
                </label>
                <select
                  value={selected.detailKeyAlgorithm}
                  onChange={(e) =>
                    updateSelected((p) => ({ ...p, detailKeyAlgorithm: e.target.value as KeyAlgorithm }))
                  }
                  className="w-full rounded border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900"
                >
                  {Object.entries(KEY_ALGO_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              {selected.structure === 'fixed-62' ? (
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Algorithme de clé (Ligne 1 — Ordonnateur)
                  </label>
                  <select
                    value={selected.headerKeyAlgorithm}
                    onChange={(e) =>
                      updateSelected((p) => ({ ...p, headerKeyAlgorithm: e.target.value as KeyAlgorithm }))
                    }
                    className="w-full rounded border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900"
                  >
                    {Object.entries(KEY_ALGO_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Séparateur de colonnes</label>
                  <select
                    value={selected.delimiter}
                    onChange={(e) =>
                      updateSelected((p) => ({
                        ...p,
                        delimiter: e.target.value as ValidationProfile['delimiter'],
                      }))
                    }
                    className="w-full rounded border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900"
                  >
                    <option value=";">Point-virgule (;)</option>
                    <option value=",">Virgule (,)</option>
                    <option value="\t">Tabulation</option>
                    <option value="|">Barre verticale (|)</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block font-medium text-slate-700 mb-1">Fins de ligne attendues</label>
                <select
                  value={selected.expectedLineEnding}
                  onChange={(e) =>
                    updateSelected((p) => ({
                      ...p,
                      expectedLineEnding: e.target.value as ValidationProfile['expectedLineEnding'],
                    }))
                  }
                  className="w-full rounded border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900"
                >
                  <option value="CRLF">Windows (CRLF — standard Algérie Poste)</option>
                  <option value="LF">Linux / Unix (LF)</option>
                  <option value="ANY">Indifférent</option>
                </select>
              </div>

              <div className="flex flex-col justify-center gap-2 pt-2">
                <label className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.allowArabicNames}
                    onChange={(e) =>
                      updateSelected((p) => ({ ...p, allowArabicNames: e.target.checked }))
                    }
                    className="rounded border-slate-400"
                  />
                  <span>Autoriser les caractères arabes dans les noms</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.allowAccentedNames}
                    onChange={(e) =>
                      updateSelected((p) => ({ ...p, allowAccentedNames: e.target.checked }))
                    }
                    className="rounded border-slate-400"
                  />
                  <span>Autoriser les lettres accentuées (é, è, ç, à)</span>
                </label>
              </div>
            </div>
          </div>

          {/* Rules Matrix */}
          <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-800">
                Règles de contrôle ({selected.rules.length})
              </h3>
              <span className="text-[11px] text-slate-500">
                Origine affichée : confirmée sur vos fichiers réels vs configurable
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              {selected.rules.map((rule) => (
                <div
                  key={rule.id}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 ${
                    rule.enabled ? 'bg-white' : 'bg-slate-50/70 opacity-65'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(e) =>
                        updateSelected((p) => ({
                          ...p,
                          rules: p.rules.map((r) =>
                            r.id === rule.id ? { ...r, enabled: e.target.checked } : r
                          ),
                        }))
                      }
                      aria-label={`Activer la règle ${rule.name}`}
                      className="mt-1 rounded border-slate-400"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
                        <span className="font-mono font-semibold text-slate-700">{rule.code}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {rule.origin === 'confirmed'
                            ? 'Confirmée sur fichier réel'
                            : 'Règle configurable'}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-slate-900">{rule.name}</p>
                      <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{rule.description}</p>
                    </div>
                  </div>

                  <select
                    value={rule.severity}
                    disabled={!rule.enabled}
                    onChange={(e) =>
                      updateSelected((p) => ({
                        ...p,
                        rules: p.rules.map((r) =>
                          r.id === rule.id ? { ...r, severity: e.target.value as Severity } : r
                        ),
                      }))
                    }
                    aria-label={`Gravité de ${rule.name}`}
                    className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 shrink-0"
                  >
                    <option value="critical">Erreur critique</option>
                    <option value="error">Erreur</option>
                    <option value="warning">Avertissement</option>
                    <option value="info">Information</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
