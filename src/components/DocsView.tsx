export function DocsView() {
  return (
    <div className="space-y-8 max-w-4xl">
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Documentation utilisateur et spécification technique
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Référentiel exact des formats Algérie Poste 62 caractères (RIP et non-RIP) vérifiés sur vos fichiers
          exemples, algorithmes de clés et garanties de confidentialité locale.
        </p>
      </div>

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
