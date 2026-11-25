import { useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  Info,
  KeyRound,
  SearchCheck,
  ShieldAlert,
  ShieldCheck,
  Wrench,
} from 'lucide-react';

interface GuideStep {
  id: number;
  title: string;
  shortTitle: string;
  subtitle: string;
  icon: typeof ShieldCheck;
  badge: string;
  summary: string;
  points: Array<{
    label: string;
    detail: string;
    tone: 'emerald' | 'amber' | 'red' | 'blue' | 'slate';
  }>;
  actionTip: string;
}

const REPORT_GUIDE_STEPS: GuideStep[] = [
  {
    id: 1,
    title: 'Lire le verdict global de conformité',
    shortTitle: 'Verdict global',
    subtitle: 'Évaluez immédiatement si le lot peut être déposé tel quel ou doit être corrigé.',
    icon: ShieldCheck,
    badge: 'Étape 1 · Décision',
    summary:
      'En haut de la vue Résultats, le badge de statut résume le niveau de risque du fichier selon le profil de validation sélectionné.',
    points: [
      {
        label: 'Conforme (Vert)',
        detail:
          'Aucune erreur critique ni bloquante détectée. Les clés, montants, longueurs (62 car.) et totaux Ligne 1 sont valides pour le dépôt.',
        tone: 'emerald',
      },
      {
        label: 'À vérifier (Ambre)',
        detail:
          'Aucune erreur bloquante, mais des avertissements sont présents : doublons de comptes (DBL-01), BOM UTF-8, fins de ligne LF/MIXED ou lignes vides.',
        tone: 'amber',
      },
      {
        label: 'Non conforme (Rouge)',
        detail:
          'Présence d’au moins une erreur critique ou bloquante (clé erronée, écart de total Ligne 1, ligne ≠ 62 car.). Rejet probable par Algérie Poste ou la banque.',
        tone: 'red',
      },
    ],
    actionTip:
      'En cas de statut « Non conforme », ne transmettez jamais le fichier avant d’avoir traité les lignes marquées Critique ou Erreur.',
  },
  {
    id: 2,
    title: 'Contrôler les 5 indicateurs et les totaux Ligne 1',
    shortTitle: 'Totaux & compteurs',
    subtitle: 'Vérifiez la cohérence mathématique entre l’en-tête (Ligne 1) et les bénéficiaires.',
    icon: BarChart3,
    badge: 'Étape 2 · Cohérence',
    summary:
      'Le bandeau de synthèse compare les valeurs recalculées sur les lignes bénéficiaires (2..N) aux valeurs déclarées dans l’en-tête (Ligne 1).',
    points: [
      {
        label: 'Enregistrements & Bénéficiaires',
        detail:
          'Compare le nombre réel de lignes type 1 (fin = 1) avec le compteur déclaré en positions 35–41 de la Ligne 1 (règle COH-02).',
        tone: 'blue',
      },
      {
        label: 'Lignes valides vs invalides',
        detail:
          'Indique combien d’ordres de virement sont sains et combien portent une erreur bloquante. Les doublons et répétitions exactes sont comptés à part.',
        tone: 'slate',
      },
      {
        label: 'Total des montants (DA)',
        detail:
          'Affiche la somme en dinars (convertie depuis les centimes). Si un écart existe avec les positions 22–34 de la Ligne 1, le montant déclaré L1 s’affiche en rouge (COH-01).',
        tone: 'red',
      },
    ],
    actionTip:
      'Un écart de 1 centime ou d’un bénéficiaire entre la Ligne 1 et le détail suffit à bloquer tout le bordereau lors du traitement bancaire.',
  },
  {
    id: 3,
    title: 'Prioriser les anomalies par gravité et code règle',
    shortTitle: 'Gravité & codes',
    subtitle: 'Filtrez la table des anomalies pour corriger d’abord les blocages majeurs.',
    icon: KeyRound,
    badge: 'Étape 3 · Diagnostic',
    summary:
      'Chaque anomalie comporte un niveau de gravité, un code règle normalisé (ex. RIP-KEY-01), la valeur lue et une suggestion de correction.',
    points: [
      {
        label: 'Critique / Erreur (Bloquants)',
        detail:
          'Codes STR-01 (longueur ≠ 62 ou préfixe * manquant), KEY-01 (clé CCP/RIP/RIB Mod 97 fausse), MNT-01 (montant nul/non numérique), BEN-01 (caractère interdit).',
        tone: 'red',
      },
      {
        label: 'Avertissement (Contrôle métier ou hygiène)',
        detail:
          'Codes DBL-01 / DBL-02 (compte répété plusieurs fois dans le lot), ENC-01 / ENC-02 (BOM UTF-8, fins de ligne LF/MIXED ou ligne vide).',
        tone: 'amber',
      },
      {
        label: 'Information (Traçabilité)',
        detail:
          'Signale par exemple l’acceptation d’une double clé Algérie Poste (Clé CCP ou Clé RIP) ou des précisions de détection automatique.',
        tone: 'blue',
      },
    ],
    actionTip:
      'Utilisez les boutons de filtre (« Critiques », « Erreurs », « Clés », « Doublons ») et la barre de recherche pour isoler rapidement un agent ou un compte.',
  },
  {
    id: 4,
    title: 'Disséquer la ligne avec l’Inspecteur 62 caractères',
    shortTitle: 'Inspecteur 62 car.',
    subtitle: 'Repérez au caractère près le champ décalé ou mal formaté.',
    icon: SearchCheck,
    badge: 'Étape 4 · Inspection',
    summary:
      'En cliquant sur n’importe quelle anomalie ou ligne dans l’onglet Enregistrements, l’Inspecteur affiche la règle graduée des 62 positions fixes.',
    points: [
      {
        label: 'Bloc Compte (Pos. 1 à 21)',
        detail:
          'Vérifie le caractère « * » (pos. 1), le préfixe 00799999 / 00000000 / code banque (pos. 2–9), le numéro sur 10 chiffres (pos. 10–19) et la clé sur 2 chiffres (pos. 20–21).',
        tone: 'blue',
      },
      {
        label: 'Bloc Montant (Pos. 22 à 34)',
        detail:
          'Doit contenir exactement 13 chiffres alignés avec des zéros à gauche, exprimés en centimes (ex. 15 000,00 DA = 0000001500000).',
        tone: 'slate',
      },
      {
        label: 'Bloc Libellé & Fin de ligne (Pos. 35 à 62)',
        detail:
          'Nom et prénom sur 27 caractères (pos. 35–61) ou Période/Compteur en Ligne 1, suivi du marqueur final « 0 » (en-tête) ou « 1 » (bénéficiaire) en position 62.',
        tone: 'emerald',
      },
    ],
    actionTip:
      'Si un caractère accentué ou invisible décale le marqueur « 1 » en position 63 ou 61, l’Inspecteur met immédiatement en évidence le décalage.',
  },
  {
    id: 5,
    title: 'Appliquer les corrections sûres et exporter le dossier',
    shortTitle: 'Correction & export',
    subtitle: 'Assainissez la technique sans altérer les données bancaires, puis archivez les preuves.',
    icon: Wrench,
    badge: 'Étape 5 · Clôture',
    summary:
      'L’onglet « Correction sûre et comparateur » et la barre d’export permettent de finaliser le contrôle en toute sécurité comptable.',
    points: [
      {
        label: 'Correction technique sûre',
        detail:
          'Supprime uniquement le BOM UTF-8, les caractères invisibles, les lignes vides et normalise les fins de ligne en CRLF Windows. Aucun compte ni montant n’est jamais modifié automatiquement.',
        tone: 'emerald',
      },
      {
        label: 'Correction métier manuelle',
        detail:
          'Pour une clé fausse ou un montant erroné, corrigez la fiche dans votre logiciel de paie ou importez le fichier dans le « Créateur de fichier » pour l’éditer sur place.',
        tone: 'amber',
      },
      {
        label: 'Livrables d’audit (PDF / Excel / TXT)',
        detail:
          'Téléchargez le « Rapport PDF récapitulatif & anomalies » pour le visa comptable, l’export Excel (.xlsx) ou séparez les « Lignes conformes » des « Lignes non conformes ».',
        tone: 'blue',
      },
    ],
    actionTip:
      'Activez le mode confidentialité dans le menu latéral avant d’exporter un PDF ou Excel destiné à une revue hors service comptable.',
  },
];

const TONE_CLASSES: Record<
  'emerald' | 'amber' | 'red' | 'blue' | 'slate',
  { border: string; bg: string; title: string; badge: string }
> = {
  emerald: {
    border: 'border-emerald-200',
    bg: 'bg-emerald-50/60',
    title: 'text-emerald-900',
    badge: 'text-emerald-700',
  },
  amber: {
    border: 'border-amber-200',
    bg: 'bg-amber-50/60',
    title: 'text-amber-900',
    badge: 'text-amber-700',
  },
  red: {
    border: 'border-red-200',
    bg: 'bg-red-50/60',
    title: 'text-red-900',
    badge: 'text-red-700',
  },
  blue: {
    border: 'border-sky-200',
    bg: 'bg-sky-50/60',
    title: 'text-sky-900',
    badge: 'text-sky-700',
  },
  slate: {
    border: 'border-slate-200',
    bg: 'bg-slate-50/80',
    title: 'text-slate-900',
    badge: 'text-slate-700',
  },
};

export function DocsView() {
  const [activeStepIdx, setActiveStepIdx] = useState(0);
  const currentStep = REPORT_GUIDE_STEPS[activeStepIdx];
  const CurrentIcon = currentStep.icon;

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Documentation utilisateur et spécification technique
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Guide interactif d’interprétation des rapports de conformité, référentiel des formats Algérie Poste 62
          caractères (RIP et non-RIP), algorithmes de clés et garanties de confidentialité locale.
        </p>
      </div>

      {/* Interactive Step-by-Step Report Interpretation Guide */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <FileCheck2 className="h-4.5 w-4.5 text-[#0F2942]" />
              <span>Guide interactif : Comment interpréter un rapport d’analyse CCP</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Parcourez les 5 étapes ci-dessous pour diagnostiquer rapidement toute anomalie avant dépôt.
            </p>
          </div>
          <span className="inline-flex items-center self-start sm:self-auto rounded bg-slate-100 px-2.5 py-1 font-mono text-xs font-semibold text-[#0F2942]">
            Étape {activeStepIdx + 1} / {REPORT_GUIDE_STEPS.length}
          </span>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-xs">
          {/* Interactive Stepper Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-5 border-b border-slate-200 bg-slate-50/70 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
            {REPORT_GUIDE_STEPS.map((step, idx) => {
              const StepIcon = step.icon;
              const isActive = idx === activeStepIdx;
              const isCompleted = idx < activeStepIdx;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setActiveStepIdx(idx)}
                  className={`flex items-center gap-2.5 px-3.5 py-3 text-left transition-colors ${
                    isActive
                      ? 'bg-[#0F2942] text-white'
                      : isCompleted
                        ? 'bg-emerald-50/50 text-slate-800 hover:bg-slate-100'
                        : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${
                      isActive
                        ? 'border-white/25 bg-white/10 text-white'
                        : isCompleted
                          ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                          : 'border-slate-200 bg-white text-slate-500'
                    }`}
                  >
                    <StepIcon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <span
                      className={`block font-mono text-[10px] uppercase tracking-wide ${
                        isActive ? 'text-slate-300' : 'text-slate-400'
                      }`}
                    >
                      Étape {step.id}
                    </span>
                    <span className="block text-xs font-semibold truncate">{step.shortTitle}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active Step Content */}
          <div className="p-5 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#0F2942]/8 border border-[#0F2942]/15 text-[#0F2942]">
                <CurrentIcon className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <span className="inline-block font-mono text-[11px] font-semibold uppercase tracking-wider text-[#0F2942]">
                  {currentStep.badge}
                </span>
                <h3 className="text-base font-bold text-slate-900">{currentStep.title}</h3>
                <p className="text-xs text-slate-600 leading-relaxed">{currentStep.subtitle}</p>
              </div>
            </div>

            <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 border border-slate-200 rounded-md px-4 py-3">
              {currentStep.summary}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {currentStep.points.map((pt) => {
                const cls = TONE_CLASSES[pt.tone];
                return (
                  <div key={pt.label} className={`rounded-md border p-3.5 space-y-1.5 ${cls.border} ${cls.bg}`}>
                    <div className="flex items-center gap-1.5">
                      {pt.tone === 'emerald' && <CheckCircle2 className={`h-4 w-4 shrink-0 ${cls.badge}`} />}
                      {pt.tone === 'amber' && <AlertTriangle className={`h-4 w-4 shrink-0 ${cls.badge}`} />}
                      {pt.tone === 'red' && <ShieldAlert className={`h-4 w-4 shrink-0 ${cls.badge}`} />}
                      {(pt.tone === 'blue' || pt.tone === 'slate') && (
                        <Info className={`h-4 w-4 shrink-0 ${cls.badge}`} />
                      )}
                      <h4 className={`text-xs font-bold ${cls.title}`}>{pt.label}</h4>
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed">{pt.detail}</p>
                  </div>
                );
              })}
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50/70 px-4 py-3 text-xs text-slate-700 flex items-start gap-2.5">
              <Info className="h-4 w-4 text-[#0F2942] shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-900">Bon réflexe : </strong>
                <span>{currentStep.actionTip}</span>
              </div>
            </div>

            {/* Navigation Footer */}
            <div className="flex items-center justify-between border-t border-slate-200 pt-4">
              <button
                type="button"
                disabled={activeStepIdx === 0}
                onClick={() => setActiveStepIdx((prev) => Math.max(0, prev - 1))}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Étape précédente</span>
              </button>

              <div className="flex items-center gap-1.5">
                {REPORT_GUIDE_STEPS.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-label={`Aller à l'étape ${s.id}`}
                    onClick={() => setActiveStepIdx(i)}
                    className={`h-2 rounded-full transition-all ${
                      i === activeStepIdx ? 'w-6 bg-[#0F2942]' : 'w-2 bg-slate-300 hover:bg-slate-400'
                    }`}
                  />
                ))}
              </div>

              <button
                type="button"
                disabled={activeStepIdx === REPORT_GUIDE_STEPS.length - 1}
                onClick={() => setActiveStepIdx((prev) => Math.min(REPORT_GUIDE_STEPS.length - 1, prev + 1))}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#0F2942] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#163A5C] disabled:opacity-40 transition-colors"
              >
                <span>Étape suivante</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Section 1: Exact 62-char Spec */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">
          01. Structure confirmée des fichiers Algérie Poste (62 caractères fixes par ligne)
        </h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          Chaque ligne des fichiers RIP et non-RIP fournis mesure exactement <strong>62 caractères</strong> (hors
          saut de ligne Windows CRLF) et débute par <code className="font-mono text-slate-900">*</code>. La
          différence déterminante entre le format RIP et le format non-RIP se situe aux positions 2 à 9 du bloc
          compte de 20 chiffres : <code className="font-mono font-semibold text-slate-900">00799999</code> pour
          un fichier RIP contre <code className="font-mono font-semibold text-slate-900">00000000</code> pour un
          fichier non-RIP.
        </p>

        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
            <thead className="bg-slate-50 font-medium text-slate-700">
              <tr>
                <th className="px-4 py-2.5">Positions</th>
                <th className="px-4 py-2.5">Long.</th>
                <th className="px-4 py-2.5">Ligne 1 (En-tête, fin = 0)</th>
                <th className="px-4 py-2.5">Lignes 2..N (Bénéficiaires, fin = 1)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              <tr>
                <td className="px-4 py-2.5 font-mono">1</td>
                <td className="px-4 py-2.5 font-mono">1</td>
                <td className="px-4 py-2.5">Préfixe obligatoire <code className="font-mono">*</code></td>
                <td className="px-4 py-2.5">Préfixe obligatoire <code className="font-mono">*</code></td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-mono">2–9</td>
                <td className="px-4 py-2.5 font-mono">8</td>
                <td className="px-4 py-2.5">
                  RIP : <code className="font-mono">00799999</code> · non-RIP : <code className="font-mono">00000000</code>
                </td>
                <td className="px-4 py-2.5">
                  RIP : <code className="font-mono">00799999</code> · non-RIP : <code className="font-mono">00000000</code>
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-mono">10–19</td>
                <td className="px-4 py-2.5 font-mono">10</td>
                <td className="px-4 py-2.5">Compte CCP ordonnateur (zéros à gauche)</td>
                <td className="px-4 py-2.5">Compte CCP bénéficiaire (zéros à gauche)</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-mono">20–21</td>
                <td className="px-4 py-2.5 font-mono">2</td>
                <td className="px-4 py-2.5">Clé de contrôle : Clé CCP (poids 4..13) ou Clé RIP (Mod 97 + 85)</td>
                <td className="px-4 py-2.5">Clé de contrôle : Clé CCP (poids 4..13) ou Clé RIP (Mod 97 + 85)</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-mono">22–34</td>
                <td className="px-4 py-2.5 font-mono">13</td>
                <td className="px-4 py-2.5">Montant global en centimes (= somme lignes 2..N)</td>
                <td className="px-4 py-2.5">Montant du virement en centimes</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-mono">35–41</td>
                <td className="px-4 py-2.5 font-mono">7</td>
                <td className="px-4 py-2.5">Nombre total de bénéficiaires (= nb lignes 2..N)</td>
                <td className="px-4 py-2.5" rowSpan={4}>
                  Nom et prénom du bénéficiaire sur <strong>27 caractères</strong> complétés par espaces à droite (positions 35 à 61)
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-mono">42–43</td>
                <td className="px-4 py-2.5 font-mono">2</td>
                <td className="px-4 py-2.5">Mois sur 2 chiffres (<code className="font-mono">01</code> à <code className="font-mono">12</code>)</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-mono">44–47</td>
                <td className="px-4 py-2.5 font-mono">4</td>
                <td className="px-4 py-2.5">Année sur 4 chiffres (ex. <code className="font-mono">2026</code>)</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-mono">48–61</td>
                <td className="px-4 py-2.5 font-mono">14</td>
                <td className="px-4 py-2.5">Zone réservée : exactement 14 espaces</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-mono">62</td>
                <td className="px-4 py-2.5 font-mono">1</td>
                <td className="px-4 py-2.5">Code type en-tête : <code className="font-mono font-semibold">0</code></td>
                <td className="px-4 py-2.5">Code type bénéficiaire : <code className="font-mono font-semibold">1</code></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 2: Key Math */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">
          02. Algorithmes de contrôle des clés vérifiés sur vos exemples
        </h2>
        <div className="rounded-md border border-slate-200 bg-white p-5 space-y-3 text-xs text-slate-700 leading-relaxed">
          <p>
            <strong>Clé CCP Algérie Poste (poids 4 à 13)</strong> : somme pondérée des chiffres du compte CCP de
            droite à gauche par <code className="font-mono">4, 5, 6, 7, 8, 9, 10, 11, 12, 13</code>, puis reste
            modulo 100. Vérifié sur les comptes réels : <code className="font-mono">0000005040 → 55</code> et{' '}
            <code className="font-mono">0000300076 → 86</code>.
          </p>
          <p>
            <strong>Clé RIP Algérie Poste (Modulo 97 avec décalage 85)</strong> : sur le compte CCP de 10 chiffres{' '}
            <code className="font-mono">C</code>, on calcule <code className="font-mono">r = ((C × 100) + 85) mod 97</code>,
            puis <code className="font-mono">Clé RIP = 97 - r</code> (2 chiffres). Vérifié sur les comptes réels :{' '}
            <code className="font-mono">0009396759 → 69</code> et <code className="font-mono">0004509479 → 68</code>.
          </p>
          <p>
            <strong>Mode Algérie Poste (par défaut) &amp; Mode strict</strong> : les fichiers réels Algérie Poste
            pouvant contenir aussi bien la Clé CCP (ex. <code className="font-mono">00799999000000504055</code>) que la
            Clé RIP (ex. <code className="font-mono">00799999000939675969</code>), les profils par défaut valident les
            deux algorithmes et rejettent toute clé mathématiquement erronée. Un mode strict mono-algorithme reste
            activable à tout moment dans <strong>Profils et règles</strong> ou dans le calculateur.
          </p>
        </div>
      </section>

      {/* Section 3: Security & Local Operation */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">
          03. Sécurité, confidentialité et fonctionnement 100 % local
        </h2>
        <div className="rounded-md border border-slate-200 bg-white p-5 space-y-2.5 text-xs text-slate-700 leading-relaxed">
          <p>• <strong>Aucune transmission réseau</strong> : la lecture des fichiers, la détection, la validation et la génération des exports PDF / Excel / CSV s’exécutent exclusivement dans la mémoire locale de votre poste.</p>
          <p>• <strong>Aucune API d’intelligence artificielle</strong> : aucune donnée CCP ou identité de bénéficiaire n’est envoyée vers un service tiers.</p>
          <p>• <strong>Intégrité du fichier source</strong> : les fichiers importés sont ouverts en lecture seule et ne sont jamais modifiés. Les corrections automatiques sont strictement limitées à l’hygiène technique (BOM, caractères invisibles, lignes vides, fins de ligne) et nécessitent une validation visuelle préalable.</p>
          <p>• <strong>Mode confidentialité et purge</strong> : activez le mode confidentialité dans la barre latérale pour masquer les numéros CCP/RIP à l’écran et dans les exports. L’historique vit uniquement en mémoire de session et s’efface en un clic ou à la fermeture de l’onglet.</p>
        </div>
      </section>

      {/* Section 4: Backup & Procedure */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">
          04. Procédure de sauvegarde des profils et mise à jour
        </h2>
        <div className="rounded-md border border-slate-200 bg-white p-5 space-y-2 text-xs text-slate-700 leading-relaxed">
          <p>
            1. Rendez-vous dans <strong>Profils et règles</strong> puis cliquez sur <strong>Sauvegarder JSON</strong>{' '}
            pour archiver la configuration validée de votre service (profils personnalisés, gravités, règles actives).
          </p>
          <p>
            2. Lors d’un changement de poste ou d’une mise à jour de l’application, utilisez <strong>Restaurer JSON</strong>{' '}
            puis exécutez la batterie de <strong>Tests automatisés</strong> afin de vérifier la non-régression avant
            tout contrôle de production.
          </p>
        </div>
      </section>
    </div>
  );
}
