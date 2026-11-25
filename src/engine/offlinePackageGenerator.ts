import { jsPDF } from 'jspdf';
import { ValidationProfile } from '../types/ccp';
import { ALGERIAN_BANKS } from './cryptoKeys';
import { buildZipStore } from './exporters';

/**
 * Calcule l'empreinte cryptographique SHA-256 d'un texte ou d'un flux d'octets
 * à l'aide de l'API standard Web Cryptography (disponible dans tous les navigateurs).
 */
export async function computeSha256(data: string | ArrayBuffer | Uint8Array): Promise<string> {
  let buffer: ArrayBuffer;
  if (typeof data === 'string') {
    buffer = new TextEncoder().encode(data).buffer;
  } else if (data instanceof Uint8Array) {
    buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  } else {
    buffer = data;
  }

  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Déclenche le téléchargement immédiat d'un Blob ou fichier texte dans le navigateur.
 */
export function triggerFileDownload(content: Blob | string, fileName: string, mimeType = 'text/plain;charset=utf-8'): void {
  const blob = typeof content === 'string' ? new Blob([content], { type: mimeType }) : content;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── SCRIPTS DE LANCEUR WINDOWS & LINUX ──

export const SCRIPT_WINDOWS_BAT = `@echo off
chcp 65001 > nul
title VérifCCP — Lancement Hors-Ligne (Poste Isolé)
color 0F

echo ===============================================================================
echo       VérifCCP — Contrôle de Conformité CCP & RIB Algérie Poste
echo                 Déploiement Autonome sur Poste Isolé
echo ===============================================================================
echo.
echo [INFO] Démarrage de l'application dans votre navigateur par défaut...
echo [INFO] Traitement 100%% local : aucune connexion Internet requise.
echo [INFO] Toutes vos données financières restent en mémoire vive sur ce PC.
echo.

set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

if exist "%SCRIPT_DIR%VerifCCP_Application_HorsLigne.html" (
    echo [OK] Fichier autonome détecté.
    start "" "%SCRIPT_DIR%VerifCCP_Application_HorsLigne.html"
    goto success
)

if exist "%SCRIPT_DIR%index.html" (
    echo [OK] Fichier d'accueil détecté.
    start "" "%SCRIPT_DIR%index.html"
    goto success
)

echo [ERREUR] Impossible de trouver le fichier HTML d'application dans :
echo %SCRIPT_DIR%
echo.
echo Veuillez vérifier que tous les fichiers du pack ont bien été extraits.
pause
exit /b 1

:success
echo.
echo [SUCCÈS] VérifCCP est ouvert dans votre navigateur.
echo Vous pouvez réduire cette fenêtre ou la fermer.
timeout /t 3 > nul
exit /b 0
`;

export const SCRIPT_LOCAL_SERVER_BAT = `@echo off
chcp 65001 > nul
title VérifCCP — Serveur Web Local Intranet
color 0B

echo ===============================================================================
echo          VérifCCP — Serveur Web Local pour Réseau d'Agence / LAN
echo ===============================================================================
echo.
echo Ce serveur permet de :
echo  1. Ouvrir l'application sans restriction de sécurité fichier local (file://)
echo  2. Partager VérifCCP avec tous les collègues du même bureau ou réseau local
echo.

set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"
set PORT=8080

echo [1/3] Recherche de Python sur ce poste...
where python >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] Python trouvé. Démarrage du serveur sur http://localhost:%PORT% ...
    start "" "http://localhost:%PORT%/VerifCCP_Application_HorsLigne.html"
    python -m http.server %PORT%
    goto end
)

where py >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] Lanceur Python (py) trouvé. Démarrage sur http://localhost:%PORT% ...
    start "" "http://localhost:%PORT%/VerifCCP_Application_HorsLigne.html"
    py -m http.server %PORT%
    goto end
)

echo [2/3] Recherche de Node.js sur ce poste...
where npx >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] Node.js trouvé. Démarrage via npx serve sur le port %PORT% ...
    start "" "http://localhost:%PORT%/VerifCCP_Application_HorsLigne.html"
    npx serve -l %PORT% .
    goto end
)

echo [3/3] Aucun interpréteur (Python / Node) détecté sur ce PC.
echo Ouverture directe du fichier autonome dans votre navigateur web par défaut...
start "" "%SCRIPT_DIR%VerifCCP_Application_HorsLigne.html"

:end
pause
`;

export const SCRIPT_LINUX_SH = `#!/bin/bash
# ===============================================================================
#       VérifCCP — Contrôle de Conformité CCP & RIB (Linux / macOS)
# ===============================================================================

PORT=8080
DIR="$( cd "$( dirname "\${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "==============================================================================="
echo "       VérifCCP — Déploiement Local / Serveur Intranet"
echo "==============================================================================="
echo "Dossier : $DIR"
echo "Port    : $PORT"
echo ""

open_browser() {
    URL="$1"
    if command -v xdg-open &>/dev/null; then
        xdg-open "$URL" &>/dev/null &
    elif command -v open &>/dev/null; then
        open "$URL" &>/dev/null &
    elif command -v sensible-browser &>/dev/null; then
        sensible-browser "$URL" &>/dev/null &
    fi
}

if command -v python3 &>/dev/null; then
    echo "[OK] Python 3 détecté. Démarrage sur http://localhost:$PORT..."
    open_browser "http://localhost:$PORT/VerifCCP_Application_HorsLigne.html"
    python3 -m http.server $PORT
elif command -v python &>/dev/null; then
    echo "[OK] Python détecté. Démarrage sur http://localhost:$PORT..."
    open_browser "http://localhost:$PORT/VerifCCP_Application_HorsLigne.html"
    python -m http.server $PORT
elif command -v npx &>/dev/null; then
    echo "[OK] Node.js détecté. Démarrage sur http://localhost:$PORT..."
    open_browser "http://localhost:$PORT/VerifCCP_Application_HorsLigne.html"
    npx serve -l $PORT .
else
    echo "[INFO] Aucun serveur Python/Node.js installé. Ouverture du fichier autonome..."
    open_browser "$DIR/VerifCCP_Application_HorsLigne.html"
fi
`;

export const SCRIPT_DESKTOP_SHORTCUT_VBS = `' ===============================================================================
' VérifCCP — Création de Raccourci Bureau Windows
' Double-cliquez sur ce fichier pour créer automatiquement le raccourci sur le bureau.
' ===============================================================================

Set WshShell = CreateObject("WScript.Shell")
strDesktop = WshShell.SpecialFolders("Desktop")
strCurrentDir = CreateObject("Scripting.FileSystemObject").GetParentFoldername(WScript.ScriptFullName)

strTarget = strCurrentDir & "\\LANCER_VERIFCCP_WINDOWS.bat"
If Not CreateObject("Scripting.FileSystemObject").FileExists(strTarget) Then
    strTarget = strCurrentDir & "\\VerifCCP_Application_HorsLigne.html"
End If

Set oShellLink = WshShell.CreateShortcut(strDesktop & "\\VérifCCP — Conformité CCP.lnk")
oShellLink.TargetPath = strTarget
oShellLink.WorkingDirectory = strCurrentDir
oShellLink.WindowStyle = 1
oShellLink.Description = "VérifCCP — Contrôle de Conformité CCP Algérie Poste et RIB Bancaires (Hors-Ligne)"
oShellLink.Save

MsgBox "Le raccourci 'VérifCCP — Conformité CCP' a été créé avec succès sur votre Bureau !" & vbCrLf & vbCrLf & "Emplacement : " & strDesktop, vbInformation, "VérifCCP — Raccourci Bureau Créé"
`;

export const README_INSTALLATION_TXT = `===============================================================================
       VÉRIFCCP — NOTICE D'INSTALLATION ET DÉPLOIEMENT SUR PC ISOLÉ
       Contrôle de Conformité CCP Algérie Poste & RIB Bancaires (Mod 97)
===============================================================================

Ce pack contient tout le nécessaire pour faire fonctionner VérifCCP sur n'importe
quel ordinateur PC (Windows 11, 10, 8, 7, Linux ou macOS) SANS AUCUNE CONNEXION INTERNET.

Toutes les opérations d'analyse, calculs de clés CCP/RIP/RIB et contrôles de fichiers
s'exécutent à 100% dans la mémoire vive de votre navigateur. Aucune donnée financière
ne quitte jamais votre poste de travail.

-------------------------------------------------------------------------------
1. MÉTHODE LA PLUS SIMPLE : CLÉ USB & DOUBLE-CLIC (Poste 100% Hors-Ligne)
-------------------------------------------------------------------------------
1. Insérez votre clé USB dans le PC isolé (sans internet).
2. Copiez l'intégralité du dossier "VerifCCP_HorsLigne" sur le disque dur local :
   Exemple recommandé : C:\\Outils_Comptabilite\\VerifCCP\\
   (Il est déconseillé de lancer l'application directement depuis la clé USB
   pour des raisons de rapidité et de droits d'accès).
3. Double-cliquez sur le fichier :
   --> "LANCER_VERIFCCP_WINDOWS.bat"
   ou directement sur "VerifCCP_Application_HorsLigne.html".
4. L'application s'ouvre instantanément dans votre navigateur par défaut
   (Microsoft Edge, Google Chrome, Mozilla Firefox ou Brave).
5. (Facultatif) Double-cliquez sur "CREER_RACCOURCI_BUREAU.vbs" pour ajouter
   un raccourci direct sur votre Bureau Windows.

-------------------------------------------------------------------------------
2. MÉTHODE INTRANET RÉSEAU LOCAL (Partage entre collègues du même bureau)
-------------------------------------------------------------------------------
Si vous souhaitez que plusieurs collègues de votre service comptabilité / agence
utilisent VérifCCP sans installer de logiciel sur chaque poste :
1. Placez ce dossier sur l'un des ordinateurs connecté au réseau local (LAN).
2. Lancez le fichier :
   --> "SERVEUR_LOCAL_PORTABLE.bat" (Windows) ou "DEMARRER_SERVEUR_LINUX.sh" (Linux).
3. Le script démarre un serveur web local sur le port 8080.
4. Vos collègues peuvent ouvrir leur navigateur et saisir l'adresse IP du poste :
   Exemple : http://192.168.1.50:8080/VerifCCP_Application_HorsLigne.html
   (Remplacez 192.168.1.50 par l'adresse IP locale de votre machine).
5. Aucun accès Internet externe n'est utilisé.

-------------------------------------------------------------------------------
3. MÉTHODE APPLICATION DE BUREAU PWA (Fenêtre autonome sans barre d'adresse)
-------------------------------------------------------------------------------
Si le PC cible possède Microsoft Edge ou Google Chrome :
1. Ouvrez l'application dans Edge ou Chrome.
2. Dans le menu du navigateur (3 petits points en haut à droite) :
   - Sur Microsoft Edge : Menu > "Applications" > "Installer ce site en tant qu'application"
   - Sur Google Chrome  : Menu > "Enregistrer et partager" > "Installer VérifCCP"
3. Une icône VérifCCP est ajoutée au menu Démarrer et à la barre des tâches.
4. L'application s'ouvre désormais dans sa propre fenêtre indépendante,
   exactement comme un logiciel Windows natif (.exe).

-------------------------------------------------------------------------------
4. SÉCURITÉ INFORMATIQUE & AUDIT DSI / RSSI
-------------------------------------------------------------------------------
- Zéro fuite de données : Aucun appel réseau vers l'extérieur (0 requête HTTP externe).
- Confidentialité : Le mode confidentialité permet de masquer les numéros de compte (••••)
  pendant les vérifications à l'écran.
- Conformité réglementaire : Respect de la loi 18-07 relative à la protection des données
  personnelles et des directives bancaires de non-divulgation des RIB/CCP.
- En fin de journée : La fermeture du navigateur ou le bouton "Purger la session" efface
  immédiatement l'historique de la mémoire vive.

-------------------------------------------------------------------------------
5. CONTENU DÉTAILLÉ DU PACK
-------------------------------------------------------------------------------
- LANCER_VERIFCCP_WINDOWS.bat        : Lanceur Windows immédiat
- SERVEUR_LOCAL_PORTABLE.bat         : Serveur intranet pour réseau local
- DEMARRER_SERVEUR_LINUX.sh          : Lanceur pour postes et serveurs Linux
- CREER_RACCOURCI_BUREAU.vbs         : Script création raccourci Bureau Windows
- VerifCCP_Application_HorsLigne.html: Application complète autonome
- GUIDE_DEPLOIEMENT_PC_ISOLE.html    : Guide complet illustré hors-ligne
- Guide_Installation_PC_Isole.pdf    : Guide officiel imprimable au format PDF
- profils_defaut_algerie_poste.json  : Sauvegarde des règles RIP / non-RIP / RIB
- README_INSTALLATION.txt            : Ce fichier d'instructions

Support & Documentation :
VérifCCP — Conforme aux spécifications Algérie Poste 62 caractères et Banques Algériennes
`;

/**
 * Génère le contenu HTML complet de l'application autonome autonome portable
 * 'VerifCCP_Application_HorsLigne.html'.
 * 100% sans dépendance externe (zéro CDN, zéro police distante, CSS/JS intégrés).
 */
export function generateStandaloneOfflineHtml(): string {
  const bankOptions = ALGERIAN_BANKS.map(
    (b) => `<option value="${b.code}">[${b.code}] ${b.shortName} — ${b.name}</option>`
  ).join('\n        ');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VérifCCP — Application Autonome Hors-Ligne</title>
  <style>
    :root {
      --primary: #0F2942;
      --primary-hover: #163A5C;
      --bg: #F6F8FA;
      --card-bg: #FFFFFF;
      --border: #CBD5E1;
      --text: #0F172A;
      --muted: #64748B;
      --success: #15803D;
      --success-bg: #ECFDF5;
      --danger: #B91C1C;
      --danger-bg: #FEF2F2;
      --warning: #B45309;
      --warning-bg: #FFFBEB;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding-bottom: 40px;
    }
    header {
      background: var(--primary);
      color: #fff;
      padding: 18px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 3px solid #E2E8F0;
    }
    header h1 { font-size: 1.25rem; font-weight: 700; }
    .badge-offline {
      background: rgba(255,255,255,0.15);
      border: 1px solid rgba(255,255,255,0.3);
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      color: #F8FAFC;
    }
    .container { max-width: 1200px; margin: 24px auto; padding: 0 16px; }
    .tabs { display: flex; gap: 8px; border-bottom: 2px solid var(--border); margin-bottom: 20px; }
    .tab-btn {
      padding: 10px 18px;
      background: none;
      border: none;
      border-bottom: 3px solid transparent;
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--muted);
      cursor: pointer;
      margin-bottom: -2px;
      transition: all 0.2s;
    }
    .tab-btn.active {
      color: var(--primary);
      border-bottom-color: var(--primary);
      background: #fff;
      border-top-left-radius: 6px;
      border-top-right-radius: 6px;
    }
    .panel { display: none; background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 24px; }
    .panel.active { display: block; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
    .form-group { margin-bottom: 14px; }
    label { display: block; font-size: 0.8rem; font-weight: 600; color: var(--text); margin-bottom: 4px; }
    input, select, textarea {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid var(--border);
      border-radius: 5px;
      font-family: inherit;
      font-size: 0.875rem;
    }
    input:focus, select:focus, textarea:focus { outline: none; border-color: var(--primary); }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: var(--primary);
      color: #fff;
      padding: 10px 18px;
      border-radius: 5px;
      border: none;
      font-weight: 600;
      font-size: 0.875rem;
      cursor: pointer;
      transition: background 0.2s;
    }
    .btn:hover { background: var(--primary-hover); }
    .btn-secondary { background: #fff; color: var(--text); border: 1px solid var(--border); }
    .btn-secondary:hover { background: #F1F5F9; }
    .result-box {
      margin-top: 16px;
      padding: 16px;
      border-radius: 6px;
      background: #F8FAFC;
      border: 1px solid var(--border);
      font-family: monospace;
      font-size: 0.875rem;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .status-ok { background: var(--success-bg); color: var(--success); border-color: #86EFAC; font-weight: bold; }
    .status-ko { background: var(--danger-bg); color: var(--danger); border-color: #FCA5A5; font-weight: bold; }
    .notice {
      background: var(--warning-bg);
      border: 1px solid #FDE68A;
      color: var(--warning);
      padding: 12px 16px;
      border-radius: 6px;
      font-size: 0.85rem;
      margin-bottom: 16px;
    }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 0.8rem; }
    th, td { border: 1px solid var(--border); padding: 8px 10px; text-align: left; }
    th { background: #F1F5F9; font-weight: 600; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>VérifCCP — Application Autonome Hors-Ligne</h1>
      <p style="font-size: 0.8rem; opacity: 0.85;">Algérie Poste (RIP / non-RIP) & Banques Algériennes (Mod 97)</p>
    </div>
    <div class="badge-offline">Poste 100% Isolé · Zéro Internet</div>
  </header>

  <div class="container">
    <div class="notice">
      <strong>Mode Autonome Actif :</strong> Cette page fonctionne intégralement sans connexion Internet.
      Aucune donnée ne quitte ce PC. Vous pouvez l'utiliser en toute sécurité sur les postes isolés du Trésor, de la Banque ou des Finances.
    </div>

    <div class="tabs">
      <button class="tab-btn active" onclick="switchTab('tab-calc')">1. Calculateur Clé CCP & RIB</button>
      <button class="tab-btn" onclick="switchTab('tab-verify')">2. Vérificateur de Fichier 62 car.</button>
      <button class="tab-btn" onclick="switchTab('tab-guide')">3. Guide de Déploiement PC Isolé</button>
    </div>

    <!-- TAB 1: CALCULATOR -->
    <div id="tab-calc" class="panel active">
      <h2 style="font-size: 1.1rem; margin-bottom: 12px;">Calculateur et Contrôle de Clé (Algérie Poste & Banques)</h2>
      <div class="grid">
        <div>
          <div class="form-group">
            <label for="calc-type">Type de Compte</label>
            <select id="calc-type" onchange="toggleCalcFields()">
              <option value="bank">RIB Bancaire Algérien (20 chiffres - Mod 97)</option>
              <option value="rip">RIP Algérie Poste (00799999 + CCP 10 car + Clé RIP)</option>
              <option value="ccp">Compte CCP Algérie Poste Classique (00000000 / Clé CCP)</option>
            </select>
          </div>

          <div id="field-bank" class="form-group">
            <label for="bank-select">Banque Algérienne</label>
            <select id="bank-select">
              ${bankOptions}
            </select>
            <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 8px; margin-top: 8px;">
              <div>
                <label for="agency-code">Agence (5 chiffres)</label>
                <input type="text" id="agency-code" placeholder="00101" maxlength="5">
              </div>
              <div>
                <label for="bank-account">N° Compte (10 chiffres)</label>
                <input type="text" id="bank-account" placeholder="0012345678" maxlength="10">
              </div>
            </div>
          </div>

          <div id="field-ccp" class="form-group" style="display: none;">
            <label for="ccp-number">Numéro de Compte CCP (1 à 10 chiffres)</label>
            <input type="text" id="ccp-number" placeholder="Exemple: 300076 ou 9396759">
          </div>

          <div class="form-group">
            <label for="actual-key">Clé Actuelle à Vérifier (facultatif)</label>
            <input type="text" id="actual-key" placeholder="Ex: 86 ou 69" maxlength="2">
          </div>

          <button class="btn" onclick="calculateKeys()">Calculer et Vérifier la Clé</button>
        </div>

        <div>
          <label>Résultat du Calcul :</label>
          <div id="calc-result" class="result-box">Renseignez les champs ci-contre et cliquez sur "Calculer".</div>
        </div>
      </div>
    </div>

    <!-- TAB 2: FILE VERIFIER -->
    <div id="tab-verify" class="panel">
      <h2 style="font-size: 1.1rem; margin-bottom: 12px;">Contrôle Rapide de Lignes 62 Caractères (Copier / Coller)</h2>
      <p style="font-size: 0.85rem; color: var(--muted); margin-bottom: 12px;">
        Collez les premières lignes de votre fichier (ou un extrait de virement) pour vérifier la structure exacte de 62 caractères,
        le préfixe *, les montants, les clés et l'en-tête.
      </p>

      <div class="form-group">
        <label for="file-content">Contenu du Fichier (Largeur Fixe 62 Caractères)</label>
        <textarea id="file-content" rows="8" placeholder="*0079999900003000768600000080000000000002112026              0
*007999990009396759690000004000000KALKOUL    ABDERRAHMANE    1
*007999990004509479680000004000000TALBI       KHIER          1"></textarea>
      </div>

      <button class="btn" onclick="verifyFileLines()">Analyser la Conformité Locale</button>

      <div id="verify-result" class="result-box" style="margin-top: 14px;">Collez votre extrait et cliquez sur "Analyser".</div>
    </div>

    <!-- TAB 3: GUIDE -->
    <div id="tab-guide" class="panel">
      <h2 style="font-size: 1.1rem; margin-bottom: 12px;">Guide d'Installation & Déploiement sur un Autre PC</h2>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
        <div>
          <h3 style="font-size: 0.95rem; color: var(--primary); margin-bottom: 8px;">Méthode 1 : Clé USB & PC 100% Isolé</h3>
          <ol style="font-size: 0.85rem; padding-left: 20px; line-height: 1.7;">
            <li>Téléchargez le <strong>Pack Autonome (.ZIP)</strong> depuis le poste connecté.</li>
            <li>Copiez le fichier ZIP sur votre clé USB sécurisée.</li>
            <li>Branchez la clé USB sur le PC cible (sans internet).</li>
            <li>Extrayez les fichiers dans un dossier local (ex. <code>C:\\VerifCCP\\</code>).</li>
            <li>Double-cliquez sur <strong>LANCER_VERIFCCP_WINDOWS.bat</strong> ou sur ce fichier HTML.</li>
            <li>L'application fonctionne immédiatement dans Edge, Chrome ou Firefox.</li>
          </ol>
        </div>

        <div>
          <h3 style="font-size: 0.95rem; color: var(--primary); margin-bottom: 8px;">Méthode 2 : Serveur Intranet Réseau Local (LAN)</h3>
          <p style="font-size: 0.85rem; line-height: 1.6; margin-bottom: 10px;">
            Pour partager VérifCCP avec tous les agents comptables du bureau sans installer sur chaque poste :
          </p>
          <ol style="font-size: 0.85rem; padding-left: 20px; line-height: 1.7;">
            <li>Placez le dossier sur un poste de votre réseau local.</li>
            <li>Lancez <strong>SERVEUR_LOCAL_PORTABLE.bat</strong> (sur Windows) ou <strong>DEMARRER_SERVEUR_LINUX.sh</strong>.</li>
            <li>Tous les postes accèdent via l'adresse IP locale : <code>http://192.168.1.X:8080/</code></li>
            <li>Aucun accès Internet requis pour l'agence.</li>
          </ol>
        </div>
      </div>

      <div style="margin-top: 20px; padding: 14px; background: #F1F5F9; border-radius: 6px;">
        <h4 style="font-size: 0.85rem; font-weight: 700; color: var(--text);">Raccourci Bureau Windows :</h4>
        <p style="font-size: 0.8rem; color: var(--muted); margin-top: 4px;">
          Double-cliquez sur <strong>CREER_RACCOURCI_BUREAU.vbs</strong> inclus dans le pack pour installer
          automatiquement une icône "VérifCCP" sur le Bureau Windows de l'utilisateur.
        </p>
      </div>
    </div>
  </div>

  <script>
    function switchTab(tabId) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      event.target.classList.add('active');
      document.getElementById(tabId).classList.add('active');
    }

    function toggleCalcFields() {
      const type = document.getElementById('calc-type').value;
      document.getElementById('field-bank').style.display = type === 'bank' ? 'block' : 'none';
      document.getElementById('field-ccp').style.display = type === 'bank' ? 'none' : 'block';
    }

    function computeCcpKey(ccpStr) {
      const clean = ccpStr.replace(/\\D/g, '');
      if (!clean) return null;
      const padded = clean.padStart(10, '0');
      let sum = 0;
      for (let i = 0; i < 10; i++) {
        sum += Number(padded[9 - i]) * (i + 4);
      }
      return String(sum % 100).padStart(2, '0');
    }

    function computeRipKeyOffset85(ccpStr) {
      const clean = ccpStr.replace(/\\D/g, '');
      if (!clean) return null;
      const num = BigInt(clean);
      const x = (num * 100n) % 97n;
      const r = (x + 85n) % 97n;
      const key = r === 0n ? 97n : 97n - r;
      return String(key).padStart(2, '0');
    }

    function computeBankRibKey(bank3, agency5, account10) {
      const b = bank3.replace(/\\D/g, '').padStart(3, '0');
      const a = agency5.replace(/\\D/g, '').padStart(5, '0');
      const c = account10.replace(/\\D/g, '').padStart(10, '0');
      const base18 = b + a + c;
      if (/^0{18}$/.test(base18)) return null;
      const rem = (BigInt(base18) * 100n) % 97n;
      const key = 97n - rem;
      return String(key).padStart(2, '0');
    }

    function calculateKeys() {
      const type = document.getElementById('calc-type').value;
      const actualKey = document.getElementById('actual-key').value.trim();
      const resEl = document.getElementById('calc-result');

      if (type === 'bank') {
        const bank = document.getElementById('bank-select').value;
        const agency = document.getElementById('agency-code').value.trim() || '00000';
        const account = document.getElementById('bank-account').value.trim();
        if (!account) {
          resEl.className = 'result-box status-ko';
          resEl.textContent = 'Erreur : Veuillez saisir au moins le numéro de compte bancaire.';
          return;
        }
        const expectedKey = computeBankRibKey(bank, agency, account);
        const fullRib = bank.padStart(3,'0') + agency.padStart(5,'0') + account.padStart(10,'0') + (expectedKey || '00');
        const isMatch = actualKey ? actualKey === expectedKey : true;

        resEl.className = isMatch ? 'result-box status-ok' : 'result-box status-ko';
        resEl.textContent = 
          '=== RÉSULTAT DU CALCUL RIB BANCAIRE (MOD 97) ===\\n' +
          'Code Banque  : ' + bank + '\\n' +
          'Code Guichet : ' + agency.padStart(5,'0') + '\\n' +
          'N° Compte    : ' + account.padStart(10,'0') + '\\n' +
          'Clé Mod 97   : ' + expectedKey + (actualKey ? (isMatch ? ' (CONFORME)' : ' (ERRONÉE ! Saisie: ' + actualKey + ')') : '') + '\\n' +
          'RIB Complet  : ' + fullRib + '\\n' +
          'Équiv. CCP   : ' + account.slice(-10).padStart(10, '0');
      } else {
        const ccp = document.getElementById('ccp-number').value.trim();
        if (!ccp) {
          resEl.className = 'result-box status-ko';
          resEl.textContent = 'Erreur : Veuillez renseigner le numéro de compte CCP.';
          return;
        }
        const ccpKey = computeCcpKey(ccp);
        const ripKey = computeRipKeyOffset85(ccp);
        const fullRip = '00799999' + ccp.padStart(10, '0') + ripKey;
        const fullNonRip = '00000000' + ccp.padStart(10, '0') + ccpKey;

        let statusText = '';
        if (actualKey) {
          if (actualKey === ripKey) statusText = ' (CORRESPOND À LA CLÉ RIP)';
          else if (actualKey === ccpKey) statusText = ' (CORRESPOND À LA CLÉ CCP)';
          else statusText = ' (CLÉ ERRONÉE : ni RIP ni CCP)';
        }

        resEl.className = (actualKey && actualKey !== ripKey && actualKey !== ccpKey) ? 'result-box status-ko' : 'result-box status-ok';
        resEl.textContent = 
          '=== RÉSULTATS DU CALCUL COMPTE CCP / RIP ===\\n' +
          'Numéro CCP   : ' + ccp.padStart(10, '0') + '\\n' +
          'Clé CCP      : ' + ccpKey + ' (Formule pondérée Algérie Poste 4..13)\\n' +
          'Clé RIP      : ' + ripKey + ' (Formule BaridiMob Modulo 97 + 85)\\n' +
          (actualKey ? 'Clé Saisie   : ' + actualKey + statusText + '\\n' : '') +
          'Format RIP   : ' + fullRip + '\\n' +
          'Format non-RIP : ' + fullNonRip;
      }
    }

    function verifyFileLines() {
      const text = document.getElementById('file-content').value.trim();
      const resEl = document.getElementById('verify-result');
      if (!text) {
        resEl.className = 'result-box status-ko';
        resEl.textContent = 'Veuillez coller au moins une ligne de fichier à analyser.';
        return;
      }

      const lines = text.split(/\\r?\\n/).filter(l => l.trim().length > 0);
      let report = 'RAPPORT DE CONTRÔLE LOCAL (' + lines.length + ' lignes analysées) :\\n';
      report += '----------------------------------------------------------------------\\n';
      let errors = 0;

      lines.forEach((line, idx) => {
        const lineNum = idx + 1;
        const len = line.length;
        const star = line.startsWith('*');
        const type = line.slice(-1);
        const account = line.slice(1, 21);
        const amount = line.slice(21, 34);

        let lineErrors = [];
        if (len !== 62) lineErrors.push('Longueur ' + len + ' car. (attendu: 62)');
        if (!star) lineErrors.push('Ne commence pas par *');
        if (lineNum === 1 && type !== '0') lineErrors.push('Ligne 1 type non-0 (fin: ' + type + ')');
        if (lineNum > 1 && type !== '1') lineErrors.push('Ligne détail type non-1 (fin: ' + type + ')');
        if (!/^\\d{13}$/.test(amount)) lineErrors.push('Montant non valide sur 13 chiffres');

        if (lineErrors.length > 0) {
          errors++;
          report += 'Ligne ' + lineNum + ' : [ERREUR] ' + lineErrors.join(' | ') + '\\n';
        } else {
          report += 'Ligne ' + lineNum + ' : [VALIDE] Type ' + type + ' | Compte ' + account + ' | Montant ' + (Number(amount)/100).toFixed(2) + ' DA\\n';
        }
      });

      report += '----------------------------------------------------------------------\\n';
      report += 'Bilan : ' + (lines.length - errors) + ' ligne(s) conforme(s), ' + errors + ' anomalie(s) détectée(s).';

      resEl.className = errors === 0 ? 'result-box status-ok' : 'result-box status-ko';
      resEl.textContent = report;
    }
  </script>
</body>
</html>`;
}

/**
 * Génère le guide officiel imprimable au format PDF avec jsPDF.
 */
export function generateOfflineGuidePdf(): Uint8Array {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const drawHeader = (title: string, sub: string) => {
    doc.setFillColor(15, 41, 66); // #0F2942
    doc.rect(0, 0, pageWidth, 24, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text(title, margin, 11);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(203, 213, 225);
    doc.text(sub, margin, 18);
    y = 32;
  };

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 16) {
      doc.addPage();
      drawHeader('VerifCCP - Guide de Deploiement Hors-Ligne', 'Poste Isole Air-Gapped et Reseau Local d\'Agence');
      return true;
    }
    return false;
  };

  const drawSection = (title: string) => {
    ensureSpace(16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 41, 66);
    doc.text(title, margin, y);
    y += 2.5;
    doc.setDrawColor(15, 41, 66);
    doc.setLineWidth(0.4);
    doc.line(margin, y, pageWidth - margin, y);
    y += 7;
  };

  const drawParagraph = (text: string, bold = false) => {
    ensureSpace(10);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    const split = doc.splitTextToSize(text, contentWidth);
    doc.text(split, margin, y);
    y += split.length * 4.2 + 2;
  };

  const drawStep = (num: string, title: string, desc: string) => {
    ensureSpace(14);
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(margin, y - 4, contentWidth, 12, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 41, 66);
    doc.text(`Etape ${num} : ${title}`, margin + 4, y + 1);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(desc, margin + 4, y + 6);
    y += 14;
  };

  // ── PAGE 1 ──
  drawHeader('VerifCCP - Guide d\'Installation & Deploiement Hors-Ligne', 'Procedure pour Postes Isoles et Reseaux Intranet sans Connexion Internet');

  drawSection('1. Architecture 100 % Locale & Securite Zero Fuite');
  drawParagraph(
    'VerifCCP est concue pour repondre aux contraintes de confidentialite financiere les plus strictes ' +
      '(Tresor Public, Algérie Poste, banques BNA, BEA, BADR, CPA, BDL, directions des finances et DRH). ' +
      'L\'application s\'execute a 100 % dans le navigateur web local. Aucune donnee, aucun numero de compte CCP ou RIB ' +
      'et aucun montant ne quitte le poste de travail. Aucun appel API externe ni telemetrie n\'est realise.'
  );

  drawSection('2. Methode 1 : Deploiement par Cle USB (Poste 100% Hors-Ligne)');
  drawParagraph('Cette methode est recommandee pour les postes de saisie totalement deconnectes d\'Internet (air-gapped) :');

  drawStep('1', 'Telechargement du pack', 'Telechargez le pack "VerifCCP_HorsLigne.zip" depuis un poste connecte a Internet.');
  drawStep('2', 'Transfert sur cle USB', 'Copiez le fichier ZIP ou dezippe sur une cle USB de service verifiee par antivirus.');
  drawStep('3', 'Copie sur le PC cible', 'Collez le dossier dans un repertoire local (ex: C:\\Outils_Comptabilite\\VerifCCP\\).');
  drawStep('4', 'Lancement immediat', 'Double-cliquez sur "LANCER_VERIFCCP_WINDOWS.bat" ou sur "VerifCCP_Application_HorsLigne.html".');
  drawStep('5', 'Raccourci Bureau', 'Double-cliquez sur "CREER_RACCOURCI_BUREAU.vbs" pour creer le raccourci Windows en 1 clic.');

  drawSection('3. Methode 2 : Serveur Web Local Intranet (Reseau d\'Agence)');
  drawParagraph(
    'Si plusieurs agents d\'un meme service ou d\'une meme agence doivent utiliser VerifCCP sur un reseau local LAN sans Internet :'
  );
  drawStep('A', 'Poste serveur local', 'Placez le dossier sur un poste ou serveur connecte au reseau local de l\'agence.');
  drawStep('B', 'Demarrage du serveur', 'Executez "SERVEUR_LOCAL_PORTABLE.bat" (Windows) ou "DEMARRER_SERVEUR_LINUX.sh".');
  drawStep('C', 'Acces multi-postes', 'Depuis les autres postes, saisissez dans le navigateur : http://[IP_LOCALE]:8080/');

  // ── PAGE 2 ──
  doc.addPage();
  drawHeader('VerifCCP - Guide d\'Installation & Deploiement Hors-Ligne', 'Application Bureau PWA et Checklist de Conformite RSSI');

  drawSection('4. Methode 3 : Installation comme Application Bureau (PWA)');
  drawParagraph(
    'Sur les postes equipes de Microsoft Edge ou Google Chrome (Windows 10/11), l\'application peut etre installee ' +
      'comme un logiciel autonome dans sa propre fenetre, avec icone dans le menu Demarrer et la barre des taches :'
  );
  drawStep('1', 'Ouverture du navigateur', 'Ouvrez VerifCCP dans Microsoft Edge ou Google Chrome.');
  drawStep('2', 'Menu d\'installation', 'Sur Edge: Menu (3 points) > "Applications" > "Installer ce site en tant qu\'application".');
  drawStep('3', 'Sur Google Chrome', 'Menu (3 points) > "Enregistrer et partager" > "Installer VerifCCP".');
  drawStep('4', 'Utilisation offline', 'L\'application se lance comme un logiciel .exe independant et reste disponible hors-ligne.');

  drawSection('5. Checklist de Securite Informatique & Audit DSI / RSSI');
  drawParagraph('Points de controle de securite a destination des administrateurs systemes et auditeurs :');

  const auditPoints = [
    '- Flux reseau sortants : 0 paquet transmis (verifiable via Wireshark ou touche F12 du navigateur).',
    '- Stockage local : Les donnees CCP sont stockees en memoire vive volatile (RAM) et detruites a la fermeture.',
    '- Mode confidentialite : Masque les numeros de compte a l\'ecran (affichage sous forme 0000••••••••12).',
    '- Conformite reglementaire : Respect des exigences de non-divulgation des donnees bancaires et de la loi 18-07.',
    '- Absence d\'elevation de privileges : Ne requiert aucun droit administrateur Windows sur le poste client.',
    '- Neutralite logicielle : Aucun composant binaire externe, DLL ou pilote a installer sur le systeme.',
  ];

  auditPoints.forEach((pt) => {
    ensureSpace(6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text(pt, margin + 2, y);
    y += 5;
  });

  drawSection('6. Foire Aux Questions (FAQ) & Depannage');
  const faqs = [
    {
      q: 'Quel navigateur utiliser sur les postes isoles ?',
      a: 'Microsoft Edge (installe par defaut sur Windows 10 et 11), Google Chrome, Mozilla Firefox ou Brave.',
    },
    {
      q: 'Dois-je installer Node.js ou Python ?',
      a: 'Non. L\'ouverture directe du fichier autonome fonctionne dans tous les navigateurs recents sans aucun outil.',
    },
    {
      q: 'Comment sauvegarder ou restaurer mes regles de validation personnalisees ?',
      a: 'Dans l\'onglet "Profils et regles", cliquez sur "Sauvegarder JSON". Le fichier peut etre reimporte sur n\'importe quel PC.',
    },
    {
      q: 'Comment purger les traces en fin de journee ?',
      a: 'Cliquez sur "Purger l\'historique" dans la barre laterale ou fermez simplement l\'onglet du navigateur.',
    },
  ];

  faqs.forEach((faq) => {
    ensureSpace(12);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 41, 66);
    doc.text(`Q : ${faq.q}`, margin, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    const split = doc.splitTextToSize(`R : ${faq.a}`, contentWidth);
    doc.text(split, margin, y);
    y += split.length * 3.8 + 3;
  });

  // Footer on each page
  const pageCount = doc.internal.pages.length - 1;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `VerifCCP - Guide de Deploiement Hors-Ligne - Page ${i} / ${pageCount} - Conforme Algerie Poste & Banques`,
      margin,
      pageHeight - 8
    );
  }

  const arrayBuf = doc.output('arraybuffer');
  return new Uint8Array(arrayBuf);
}

/**
 * Génère le pack ZIP complet contenant tous les fichiers pour l'installation hors-ligne sur un autre PC.
 */
export function generateOfflinePackageZip(profiles: ValidationProfile[]): Uint8Array<ArrayBuffer> {
  const defaultProfilesJson = JSON.stringify(
    {
      schema: 'verifccp-offline-pack-v1',
      generatedAt: new Date().toISOString(),
      profiles,
    },
    null,
    2
  );

  const pdfGuideBytes = generateOfflineGuidePdf();
  const standaloneHtml = generateStandaloneOfflineHtml();

  const filesToZip: Array<{ name: string; content: string | Uint8Array }> = [
    { name: 'LANCER_VERIFCCP_WINDOWS.bat', content: SCRIPT_WINDOWS_BAT },
    { name: 'SERVEUR_LOCAL_PORTABLE.bat', content: SCRIPT_LOCAL_SERVER_BAT },
    { name: 'DEMARRER_SERVEUR_LINUX.sh', content: SCRIPT_LINUX_SH },
    { name: 'CREER_RACCOURCI_BUREAU.vbs', content: SCRIPT_DESKTOP_SHORTCUT_VBS },
    { name: 'README_INSTALLATION.txt', content: README_INSTALLATION_TXT },
    { name: 'VerifCCP_Application_HorsLigne.html', content: standaloneHtml },
    { name: 'Guide_Installation_PC_Isole.pdf', content: pdfGuideBytes },
    { name: 'profils_defaut_algerie_poste.json', content: defaultProfilesJson },
  ];

  return buildZipStore(filesToZip);
}
