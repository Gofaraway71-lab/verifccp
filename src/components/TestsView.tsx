import { useState } from 'react';
import { CheckCircle2, FlaskConical, Play, XCircle } from 'lucide-react';
import { AutomatedTestResult, ValidationProfile } from '../types/ccp';
import { runAutomatedTestSuite } from '../engine/samplesAndTests';

interface TestsViewProps {
  profiles: ValidationProfile[];
  onInspectTestSample: (fileName: string, content: string, formatHint: 'rip' | 'non-rip' | 'rib' | 'both') => void;
}

export function TestsView({ profiles, onInspectTestSample }: TestsViewProps) {
  const [results, setResults] = useState<AutomatedTestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const handleRunAll = async () => {
    setIsRunning(true);
    try {
      const out = await runAutomatedTestSuite(profiles);
      setResults(out);
    } finally {
      setIsRunning(false);
    }
  };

  const passedCount = results.filter((r) => r.passed).length;
  const totalTime = results.reduce((s, r) => s + r.durationMs, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Tests automatisés et non-régression
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Exécutez en direct la batterie de 19 tests couvrant les fichiers RIP, non-RIP et RIB bancaires, le calcul strict de la
            clé selon le format du compte, l’étanchéité entre moteurs, les caractères arabes, l’encodage et un lot de 5 000 lignes.
          </p>
        </div>
        <button
          type="button"
          disabled={isRunning}
          onClick={() => void handleRunAll()}
          className="inline-flex items-center gap-2 rounded-md bg-[#0F2942] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#163A5C] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
        >
          <Play className="h-4 w-4" />
          <span>{isRunning ? 'Exécution en cours...' : 'Exécuter les 19 tests'}</span>
        </button>
      </div>

      {results.length === 0 ? (
        <div className="rounded-md border border-slate-200 bg-white px-6 py-14 text-center">
          <FlaskConical className="mx-auto h-9 w-9 text-slate-400" />
          <h2 className="mt-3 text-base font-semibold text-slate-900">
            Batterie de validation prête
          </h2>
          <p className="mt-1 text-xs text-slate-500 max-w-lg mx-auto">
            Cliquez sur « Exécuter les 19 tests » pour vérifier instantanément chaque règle de conformité RIP,
            non-RIP et RIB bancaire dans votre navigateur.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 border border-slate-200 bg-white divide-y sm:divide-y-0 sm:divide-x divide-slate-200 rounded-md overflow-hidden">
            <div className="p-4">
              <p className="text-xs text-slate-500">Tests réussis</p>
              <p
                className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${
                  passedCount === results.length ? 'text-emerald-700' : 'text-red-700'
                }`}
              >
                {passedCount} / {results.length}
              </p>
            </div>
            <div className="p-4">
              <p className="text-xs text-slate-500">Échecs</p>
              <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                {results.length - passedCount}
              </p>
            </div>
            <div className="p-4">
              <p className="text-xs text-slate-500">Temps total (incluant lot 5 000 lignes)</p>
              <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                {totalTime} ms
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 font-medium text-slate-600">
                <tr>
                  <th className="px-3 py-3 w-16">ID</th>
                  <th className="px-3 py-3">Scénario de test</th>
                  <th className="px-3 py-3">Statut</th>
                  <th className="px-3 py-3">Résultat observé</th>
                  <th className="px-3 py-3 text-right">Durée</th>
                  <th className="px-3 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {results.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="px-3 py-3 font-mono font-semibold text-slate-800">{r.id}</td>
                    <td className="px-3 py-3">
                      <p className="font-medium text-slate-900">{r.name}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {r.category} · Attendu : {r.expectedSummary}
                      </p>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {r.passed ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Réussi</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-700 font-semibold">
                          <XCircle className="h-3.5 w-3.5" />
                          <span>Échec</span>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 font-mono text-[11px] text-slate-700 max-w-xs">
                      {r.actualSummary}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-slate-600 tabular-nums whitespace-nowrap">
                      {r.durationMs} ms
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      {r.sampleFileName && r.sampleContent !== undefined && r.id !== 'T05' && r.id !== 'T14' && r.id !== 'T17' && (
                        <button
                          type="button"
                          onClick={() =>
                            onInspectTestSample(r.sampleFileName!, r.sampleContent!, r.formatTested)
                          }
                          className="rounded border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-[#0F2942] hover:text-white hover:border-[#0F2942] transition-colors"
                        >
                          Ouvrir le rapport
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
