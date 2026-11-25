import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronRight,
  Code2,
  Copy,
  Download,
  FileCode,
  FileText,
  HardDriveDownload,
  Laptop,
  Network,
  Play,
  RotateCcw,
  Shield,
  ShieldCheck,
  Terminal,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { ValidationProfile } from '../types/ccp';
import {
  computeSha256,
  generateOfflineGuidePdf,
  generateOfflinePackageZip,
  generateStandaloneOfflineHtml,
  README_INSTALLATION_TXT,
  SCRIPT_DESKTOP_SHORTCUT_VBS,
  SCRIPT_LINUX_SH,
  SCRIPT_LOCAL_SERVER_BAT,
  SCRIPT_WINDOWS_BAT,
  triggerFileDownload,
} from '../engine/offlinePackageGenerator';

interface OfflineInstallViewProps {
  profiles: ValidationProfile[];
}

type OfflineTab = 'pack' | 'methods' | 'scripts' | 'diagnostic';
type InstallMethod = 'usb' | 'lan' | 'pwa' | 'security';

export function OfflineInstallView({ profiles }: OfflineInstallViewProps) {
  const [activeTab, setActiveTab] = useState<OfflineTab>('pack');
  const [activeMethod, setActiveMethod] = useState<InstallMethod>('usb');
  const [activeScript, setActiveScript] = useState<'win' | 'server' | 'linux' | 'vbs'>('win');
  const [copiedScript, setCopiedScript] = useState<string | null>(null);

  // Diagnostic states
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [simulatedOffline, setSimulatedOffline] = useState(false);
  const [shaInput, setShaInput] = useState('');
  const [calculatedHash, setCalculatedHash] = useState('');
  const [isGeneratingZip, setIsGeneratingZip] = useState(false);
  const [zipNotice, setZipNotice] = useState<string | null>(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedScript(label);
    setTimeout(() => setCopiedScript(null), 2000);
  };

  const handleCalculateSha = async (val: string) => {
    setShaInput(val);
    if (!val.trim()) {
      setCalculatedHash('');
      return;
    }
    const hash = await computeSha256(val);
    setCalculatedHash(hash);
  };

  const handleDownloadZip = async () => {
    setIsGeneratingZip(true);
    setZipNotice(null);
    try {
      const zipBytes = generateOfflinePackageZip(profiles);
      const blob = new Blob([zipBytes.buffer as ArrayBuffer], { type: 'application/zip' });
      triggerFileDownload(blob, `VerifCCP_Pack_HorsLigne_${new Date().toISOString().slice(0, 10)}.zip`, 'application/zip');
      setZipNotice('Le pack hors-ligne complet a été généré et téléchargé avec succès !');
    } catch (err) {
      setZipNotice(`Erreur lors de la génération du zip : ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsGeneratingZip(false);
    }
  };

  const handleDownloadPdfGuide = () => {
    const pdfBytes = generateOfflineGuidePdf();
    const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    triggerFileDownload(blob, `Guide_Installation_VerifCCP_PC_Isole_${new Date().toISOString().slice(0, 10)}.pdf`, 'application/pdf');
  };

  const handleDownloadStandaloneHtml = () => {
    const html = generateStandaloneOfflineHtml();
    triggerFileDownload(html, 'VerifCCP_Application_HorsLigne.html', 'text/html;charset=utf-8');
  };

  const scriptsData = {
    win: {
      name: 'LANCER_VERIFCCP_WINDOWS.bat',
      lang: 'batch',
      content: SCRIPT_WINDOWS_BAT,
      desc: 'Lanceur Windows direct : ouvre l’application dans le navigateur par défaut sans installation.',
    },
    server: {
      name: 'SERVEUR_LOCAL_PORTABLE.bat',
      lang: 'batch',
      content: SCRIPT_LOCAL_SERVER_BAT,
      desc: 'Démarre un serveur web local sur le port 8080 pour partager l’application sur le réseau local d’agence.',
    },
    linux: {
      name: 'DEMARRER_SERVEUR_LINUX.sh',
      lang: 'bash',
      content: SCRIPT_LINUX_SH,
      desc: 'Script de lancement pour les systèmes Linux ou macOS (avec Python 3, Python ou Node).',
    },
    vbs: {
      name: 'CREER_RACCOURCI_BUREAU.vbs',
      lang: 'vbscript',
      content: SCRIPT_DESKTOP_SHORTCUT_VBS,
      desc: 'Script Windows pour créer automatiquement l’icône de raccourci sur le Bureau de l’utilisateur.',
    },
  };

  return (
    <div className="space-y-6">
      {/* Title & Context Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Installation hors-ligne sur un autre PC
            </h1>
            <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>100 % Autonome</span>
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600 max-w-3xl">
            Transférez et installez VérifCCP sur des postes de travail isolés (Trésor Public, agences bancaires BNA/BEA,
            directions comptables, services RH) totalement déconnectés d’Internet. Traitement 100 % local garanti.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDownloadPdfGuide}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <FileText className="h-4 w-4 text-slate-500" />
            <span>Guide PDF imprimable</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadZip}
            disabled={isGeneratingZip}
            className="inline-flex items-center gap-2 rounded-md bg-[#0F2942] px-4 py-2 text-xs font-medium text-white hover:bg-[#163A5C] disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <Archive className="h-4 w-4" />
            <span>{isGeneratingZip ? 'Création du pack...' : 'Télécharger le Pack Complet (.ZIP)'}</span>
          </button>
        </div>
      </div>

      {zipNotice && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-900 flex items-center justify-between">
          <span>{zipNotice}</span>
          <button type="button" onClick={() => setZipNotice(null)} className="text-emerald-700 hover:underline">
            Fermer
          </button>
        </div>
      )}

      {/* Main Sub-Navigation */}
      <div className="flex border-b border-slate-200 gap-6 text-sm">
        <button
          type="button"
          onClick={() => setActiveTab('pack')}
          className={`pb-3 font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'pack'
              ? 'border-[#0F2942] text-[#0F2942]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Pack de déploiement autonome
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('methods')}
          className={`pb-3 font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'methods'
              ? 'border-[#0F2942] text-[#0F2942]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Guide d'installation pas-à-pas (4 méthodes)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('scripts')}
          className={`pb-3 font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'scripts'
              ? 'border-[#0F2942] text-[#0F2942]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Scripts de lancement (.bat / .sh / .vbs)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('diagnostic')}
          className={`pb-3 font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'diagnostic'
              ? 'border-[#0F2942] text-[#0F2942]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Diagnostic &amp; Certification SHA-256
        </button>
      </div>

      {/* TAB 1: PACK & TÉLÉCHARGEMENT */}
      {activeTab === 'pack' && (
        <div className="space-y-6">
          {/* Hero Banner */}
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-xs space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-2 max-w-2xl">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded bg-[#0F2942] px-2 py-0.5 text-[11px] font-semibold text-white">
                    Pack Officiel Hors-Ligne
                  </span>
                  <span className="text-xs text-slate-500 font-mono">Format ZIP universel · Prêt à copier sur clé USB</span>
                </div>
                <h2 className="text-lg font-bold text-slate-900">
                  Déployer VérifCCP sur n'importe quel ordinateur sans Internet
                </h2>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Ce pack réunit l’application autonome, les scripts de lancement Windows et Linux,
                  le créateur automatique de raccourci bureau, la sauvegarde des profils et le guide d’installation
                  au format PDF officiel.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={handleDownloadZip}
                  disabled={isGeneratingZip}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-md bg-[#0F2942] px-5 py-3 text-sm font-semibold text-white hover:bg-[#163A5C] shadow-sm transition-colors"
                >
                  <Archive className="h-5 w-5" />
                  <span>{isGeneratingZip ? 'Génération en cours...' : 'Télécharger le Pack ZIP complet'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadStandaloneHtml}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <FileCode className="h-4 w-4 text-slate-500" />
                  <span>Fichier HTML autonome seul</span>
                </button>
              </div>
            </div>

            {/* Checklist items */}
            <div className="border-t border-slate-100 pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs text-slate-700">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Aucun droit administrateur requis</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Compatible Windows 11, 10, 8, 7</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Edge, Chrome, Firefox, Brave</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Zéro composant réseau ou DLL</span>
              </div>
            </div>
          </div>

          {/* Included Files Inventory */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">
              Fichiers inclus dans le pack hors-ligne (téléchargeables individuellement)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* File 1: Windows Launcher */}
              <div className="rounded-md border border-slate-200 bg-white p-4 flex items-start justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Terminal className="h-4 w-4 text-[#0F2942]" />
                    <p className="font-mono text-xs font-bold text-slate-900 truncate">LANCER_VERIFCCP_WINDOWS.bat</p>
                  </div>
                  <p className="text-xs text-slate-600">
                    Double-clic pour démarrer immédiatement dans votre navigateur par défaut sans aucune invite de commande.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => triggerFileDownload(SCRIPT_WINDOWS_BAT, 'LANCER_VERIFCCP_WINDOWS.bat')}
                  className="rounded border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
                  title="Télécharger ce fichier"
                >
                  <Download className="h-4 w-4" />
                </button>
              </div>

              {/* File 2: Local Server */}
              <div className="rounded-md border border-slate-200 bg-white p-4 flex items-start justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Network className="h-4 w-4 text-[#0F2942]" />
                    <p className="font-mono text-xs font-bold text-slate-900 truncate">SERVEUR_LOCAL_PORTABLE.bat</p>
                  </div>
                  <p className="text-xs text-slate-600">
                    Démarre un serveur web local (port 8080) pour partager VérifCCP sur tout le réseau d'agence.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => triggerFileDownload(SCRIPT_LOCAL_SERVER_BAT, 'SERVEUR_LOCAL_PORTABLE.bat')}
                  className="rounded border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
                  title="Télécharger ce fichier"
                >
                  <Download className="h-4 w-4" />
                </button>
              </div>

              {/* File 3: Linux Shell */}
              <div className="rounded-md border border-slate-200 bg-white p-4 flex items-start justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Code2 className="h-4 w-4 text-[#0F2942]" />
                    <p className="font-mono text-xs font-bold text-slate-900 truncate">DEMARRER_SERVEUR_LINUX.sh</p>
                  </div>
                  <p className="text-xs text-slate-600">
                    Script bash pour serveurs internes ou postes de travail sous Ubuntu, Debian, RedHat ou CentOS.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => triggerFileDownload(SCRIPT_LINUX_SH, 'DEMARRER_SERVEUR_LINUX.sh')}
                  className="rounded border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
                  title="Télécharger ce fichier"
                >
                  <Download className="h-4 w-4" />
                </button>
              </div>

              {/* File 4: Desktop Shortcut VBS */}
              <div className="rounded-md border border-slate-200 bg-white p-4 flex items-start justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Laptop className="h-4 w-4 text-[#0F2942]" />
                    <p className="font-mono text-xs font-bold text-slate-900 truncate">CREER_RACCOURCI_BUREAU.vbs</p>
                  </div>
                  <p className="text-xs text-slate-600">
                    Crée automatiquement l’icône de raccourci "VérifCCP" sur le Bureau Windows de l'utilisateur.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => triggerFileDownload(SCRIPT_DESKTOP_SHORTCUT_VBS, 'CREER_RACCOURCI_BUREAU.vbs')}
                  className="rounded border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
                  title="Télécharger ce fichier"
                >
                  <Download className="h-4 w-4" />
                </button>
              </div>

              {/* File 5: Standalone HTML */}
              <div className="rounded-md border border-slate-200 bg-white p-4 flex items-start justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <FileCode className="h-4 w-4 text-emerald-700" />
                    <p className="font-mono text-xs font-bold text-slate-900 truncate">VerifCCP_Application_HorsLigne.html</p>
                  </div>
                  <p className="text-xs text-slate-600">
                    Application complète en un seul fichier HTML : calculateur de clé CCP/RIB Mod 97, contrôle de fichier 62 car. et notice.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadStandaloneHtml}
                  className="rounded border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
                  title="Télécharger ce fichier"
                >
                  <Download className="h-4 w-4" />
                </button>
              </div>

              {/* File 6: Official PDF Guide */}
              <div className="rounded-md border border-slate-200 bg-white p-4 flex items-start justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-red-700" />
                    <p className="font-mono text-xs font-bold text-slate-900 truncate">Guide_Installation_PC_Isole.pdf</p>
                  </div>
                  <p className="text-xs text-slate-600">
                    Guide de déploiement officiel imprimable avec captures d’étapes, fiches techniques et checklist DSI / RSSI.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadPdfGuide}
                  className="rounded border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
                  title="Télécharger ce fichier"
                >
                  <Download className="h-4 w-4" />
                </button>
              </div>

              {/* File 7: Readme Notepad */}
              <div className="rounded-md border border-slate-200 bg-white p-4 flex items-start justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-slate-600" />
                    <p className="font-mono text-xs font-bold text-slate-900 truncate">README_INSTALLATION.txt</p>
                  </div>
                  <p className="text-xs text-slate-600">
                    Notice texte claire formatée pour le Bloc-notes Windows, idéale pour être lue directement sur la clé USB.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => triggerFileDownload(README_INSTALLATION_TXT, 'README_INSTALLATION.txt')}
                  className="rounded border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
                  title="Télécharger ce fichier"
                >
                  <Download className="h-4 w-4" />
                </button>
              </div>

              {/* File 8: Profiles Backup */}
              <div className="rounded-md border border-slate-200 bg-white p-4 flex items-start justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Code2 className="h-4 w-4 text-amber-700" />
                    <p className="font-mono text-xs font-bold text-slate-900 truncate">profils_defaut_algerie_poste.json</p>
                  </div>
                  <p className="text-xs text-slate-600">
                    Sauvegarde des 6 profils et règles de contrôle (RIP, non-RIP, RIB Bancaire) réimportable dans l'application.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const json = JSON.stringify({ schema: 'verifccp-profiles-v1', profiles }, null, 2);
                    triggerFileDownload(json, 'profils_defaut_algerie_poste.json', 'application/json');
                  }}
                  className="rounded border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
                  title="Télécharger ce fichier"
                >
                  <Download className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: GUIDE PAS-À-PAS */}
      {activeTab === 'methods' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Method selector sidebar */}
          <div className="lg:col-span-4 space-y-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">
              Méthodes de déploiement
            </h3>
            <div className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => setActiveMethod('usb')}
                className={`w-full p-3.5 text-left transition-colors flex items-center justify-between ${
                  activeMethod === 'usb' ? 'bg-[#0F2942] text-white' : 'hover:bg-slate-50 text-slate-800'
                }`}
              >
                <div>
                  <p className="font-bold">Méthode 1 : Clé USB &amp; PC Isolé</p>
                  <p className={`mt-0.5 text-[11px] ${activeMethod === 'usb' ? 'text-slate-300' : 'text-slate-500'}`}>
                    Poste 100% hors-ligne (air-gapped)
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => setActiveMethod('lan')}
                className={`w-full p-3.5 text-left transition-colors flex items-center justify-between ${
                  activeMethod === 'lan' ? 'bg-[#0F2942] text-white' : 'hover:bg-slate-50 text-slate-800'
                }`}
              >
                <div>
                  <p className="font-bold">Méthode 2 : Réseau Intranet Local</p>
                  <p className={`mt-0.5 text-[11px] ${activeMethod === 'lan' ? 'text-slate-300' : 'text-slate-500'}`}>
                    Partage multi-postes sans Internet (LAN)
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => setActiveMethod('pwa')}
                className={`w-full p-3.5 text-left transition-colors flex items-center justify-between ${
                  activeMethod === 'pwa' ? 'bg-[#0F2942] text-white' : 'hover:bg-slate-50 text-slate-800'
                }`}
              >
                <div>
                  <p className="font-bold">Méthode 3 : Application de Bureau PWA</p>
                  <p className={`mt-0.5 text-[11px] ${activeMethod === 'pwa' ? 'text-slate-300' : 'text-slate-500'}`}>
                    Fenêtre native Edge &amp; Chrome (.exe-like)
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => setActiveMethod('security')}
                className={`w-full p-3.5 text-left transition-colors flex items-center justify-between ${
                  activeMethod === 'security' ? 'bg-[#0F2942] text-white' : 'hover:bg-slate-50 text-slate-800'
                }`}
              >
                <div>
                  <p className="font-bold">Méthode 4 : Conformité &amp; DSI / RSSI</p>
                  <p className={`mt-0.5 text-[11px] ${activeMethod === 'security' ? 'text-slate-300' : 'text-slate-500'}`}>
                    Checklist de sécurité &amp; règles pare-feu
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0" />
              </button>
            </div>
          </div>

          {/* Method Content */}
          <div className="lg:col-span-8 rounded-md border border-slate-200 bg-white p-6 space-y-6">
            {activeMethod === 'usb' && (
              <div className="space-y-5">
                <div className="border-b border-slate-200 pb-3">
                  <span className="text-[11px] font-mono text-[#0F2942] font-semibold uppercase">Recommandé</span>
                  <h3 className="text-base font-bold text-slate-900 mt-0.5">
                    Méthode 1 : Déploiement par Clé USB sur Poste 100 % Isolé
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Idéal pour les postes de saisie et de contrôle sans aucune carte réseau ou avec accès Internet bloqué.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0F2942] text-xs font-bold text-white">
                      1
                    </span>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-900">Télécharger le Pack ZIP sur le PC connecté</p>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Sur votre ordinateur avec accès Internet, cliquez sur « Télécharger le Pack Complet (.ZIP) » ci-dessus.
                        Le fichier pèse environ 150 Ko.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0F2942] text-xs font-bold text-white">
                      2
                    </span>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-900">Copier sur la clé USB de service</p>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Copiez l'archive ZIP sur votre clé USB. Pour respecter les règles de sécurité informatique,
                        il est conseillé de scanner la clé avec votre antivirus d'entreprise avant insertion.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0F2942] text-xs font-bold text-white">
                      3
                    </span>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-900">Extraire le dossier sur le disque dur du PC cible</p>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Sur le PC isolé, faites un clic droit sur le fichier ZIP &gt; « Extraire tout... » vers un dossier local permanent :
                      </p>
                      <code className="block rounded bg-slate-100 p-2 text-[11px] font-mono text-slate-800">
                        C:\Outils_Comptabilite\VerifCCP\
                      </code>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0F2942] text-xs font-bold text-white">
                      4
                    </span>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-900">Lancer l'application</p>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Double-cliquez sur <strong className="font-mono text-slate-800">LANCER_VERIFCCP_WINDOWS.bat</strong> ou directement sur{' '}
                        <strong className="font-mono text-slate-800">VerifCCP_Application_HorsLigne.html</strong>.
                        L’interface s’ouvre instantanément dans Microsoft Edge, Google Chrome ou Firefox.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0F2942] text-xs font-bold text-white">
                      5
                    </span>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-900">Créer le raccourci Bureau</p>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Double-cliquez sur <strong className="font-mono text-slate-800">CREER_RACCOURCI_BUREAU.vbs</strong> pour
                        ajouter une icône "VérifCCP" directement sur votre Bureau Windows.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeMethod === 'lan' && (
              <div className="space-y-5">
                <div className="border-b border-slate-200 pb-3">
                  <span className="text-[11px] font-mono text-amber-700 font-semibold uppercase">Intranet d'Agence</span>
                  <h3 className="text-base font-bold text-slate-900 mt-0.5">
                    Méthode 2 : Partage sur le Réseau Local (LAN d'Agence ou Trésorerie)
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Permet à tous les agents du même service d’accéder à VérifCCP sans installer de fichier sur chaque ordinateur.
                  </p>
                </div>

                <div className="space-y-4 text-xs text-slate-700">
                  <p className="leading-relaxed">
                    Si votre agence bancaire, trésorerie ou direction possède un réseau local interne (sans accès externe à Internet),
                    vous pouvez héberger VérifCCP sur l'un des postes et le rendre accessible à tous les autres postes en 30 secondes :
                  </p>

                  <div className="rounded border border-slate-200 bg-slate-50 p-3.5 space-y-2">
                    <p className="font-bold text-slate-900">Étape A : Sur le poste hébergeur</p>
                    <p className="text-slate-600 leading-relaxed">
                      Lancez <strong className="font-mono">SERVEUR_LOCAL_PORTABLE.bat</strong> (Windows) ou{' '}
                      <strong className="font-mono">DEMARRER_SERVEUR_LINUX.sh</strong> (Linux). Le script détecte automatiquement
                      Python (présent nativement sur de nombreux systèmes) ou Node.js et démarre un serveur local sur le port 8080.
                    </p>
                  </div>

                  <div className="rounded border border-slate-200 bg-slate-50 p-3.5 space-y-2">
                    <p className="font-bold text-slate-900">Étape B : Obtenir l'adresse IP locale du poste</p>
                    <p className="text-slate-600 leading-relaxed">
                      Ouvrez l’invite de commandes Windows (cmd) et tapez <strong className="font-mono">ipconfig</strong>.
                      Notez votre adresse IPv4 (ex. <strong className="font-mono text-slate-900">192.168.1.50</strong>).
                    </p>
                  </div>

                  <div className="rounded border border-slate-200 bg-slate-50 p-3.5 space-y-2">
                    <p className="font-bold text-slate-900">Étape C : Connexion des autres agents comptables</p>
                    <p className="text-slate-600 leading-relaxed">
                      Les collègues de votre bureau ouvrent leur navigateur web et saisissent dans la barre d'adresse :
                    </p>
                    <code className="block rounded bg-white border border-slate-200 p-2 font-mono text-[11px] text-slate-900">
                      http://192.168.1.50:8080/VerifCCP_Application_HorsLigne.html
                    </code>
                    <p className="text-slate-500 text-[11px]">
                      (Remplacez 192.168.1.50 par l'adresse IP réelle du poste hébergeur).
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeMethod === 'pwa' && (
              <div className="space-y-5">
                <div className="border-b border-slate-200 pb-3">
                  <span className="text-[11px] font-mono text-blue-700 font-semibold uppercase">Desktop PWA</span>
                  <h3 className="text-base font-bold text-slate-900 mt-0.5">
                    Méthode 3 : Installation en tant qu'Application de Bureau
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Transformez l'application en une véritable fenêtre de bureau indépendante sans barre d'adresse de navigateur.
                  </p>
                </div>

                <div className="space-y-4 text-xs text-slate-700">
                  <p className="leading-relaxed">
                    Les navigateurs modernes comme <strong>Microsoft Edge</strong> (fourni par défaut avec Windows 10 et 11) et{' '}
                    <strong>Google Chrome</strong> permettent d'installer VérifCCP comme un logiciel Windows autonome :
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded border border-slate-200 p-4 space-y-2 bg-slate-50/70">
                      <p className="font-bold text-slate-900">Sur Microsoft Edge :</p>
                      <ol className="list-decimal list-inside space-y-1 text-slate-600">
                        <li>Ouvrez VérifCCP dans Edge.</li>
                        <li>Cliquez sur les <strong>3 points (...)</strong> en haut à droite.</li>
                        <li>Sélectionnez <strong>Applications</strong>.</li>
                        <li>Cliquez sur <strong>« Installer ce site en tant qu'application »</strong>.</li>
                        <li>Confirmez le nom <strong>VérifCCP</strong>.</li>
                      </ol>
                    </div>

                    <div className="rounded border border-slate-200 p-4 space-y-2 bg-slate-50/70">
                      <p className="font-bold text-slate-900">Sur Google Chrome :</p>
                      <ol className="list-decimal list-inside space-y-1 text-slate-600">
                        <li>Ouvrez VérifCCP dans Chrome.</li>
                        <li>Cliquez sur les <strong>3 points (...)</strong> en haut à droite.</li>
                        <li>Sélectionnez <strong>« Enregistrer et partager »</strong>.</li>
                        <li>Cliquez sur <strong>« Installer VérifCCP... »</strong>.</li>
                        <li>Une icône apparaît sur votre Bureau et barre des tâches.</li>
                      </ol>
                    </div>
                  </div>

                  <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-900 text-xs">
                    <strong>Avantage clé :</strong> Une fois installée, l'application est entièrement mise en cache
                    et se lancera instantanément même lorsque le câble réseau est débranché ou sans connexion Internet !
                  </div>
                </div>
              </div>
            )}

            {activeMethod === 'security' && (
              <div className="space-y-5">
                <div className="border-b border-slate-200 pb-3">
                  <span className="text-[11px] font-mono text-purple-700 font-semibold uppercase">Sécurité DSI / RSSI</span>
                  <h3 className="text-base font-bold text-slate-900 mt-0.5">
                    Méthode 4 : Protocole de Sécurité &amp; Audit Informatique
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Éléments techniques destinés aux responsables de sécurité (RSSI) et administrateurs système.
                  </p>
                </div>

                <div className="space-y-3 text-xs text-slate-700 leading-relaxed">
                  <p>
                    VérifCCP est expressément conçue selon le principe du <em>Zero Knowledge Architecture</em> :
                  </p>

                  <div className="space-y-2 divide-y divide-slate-100">
                    <div className="pt-2">
                      <strong className="text-slate-900">1. Aucune transmission réseau :</strong>
                      <p className="text-slate-600">
                        Aucun paquet TCP/UDP sortant n’est émis pendant le traitement des fichiers.
                        Vous pouvez le certifier en observant l’onglet Réseau (F12) ou avec un outil d’analyse de trames (Wireshark).
                      </p>
                    </div>

                    <div className="pt-2">
                      <strong className="text-slate-900">2. Aucun cookie de traçage ni télémétrie :</strong>
                      <p className="text-slate-600">
                        L’application n’utilise aucun service tiers (pas de Google Analytics, pas de CDN externe en mode autonome).
                      </p>
                    </div>

                    <div className="pt-2">
                      <strong className="text-slate-900">3. Traitement exclusif en mémoire vive (RAM) :</strong>
                      <p className="text-slate-600">
                        Les fichiers analysés ne sont pas écrits sur le disque dur. Dès que l'onglet est fermé ou que vous
                        cliquez sur « Purger l'historique », la mémoire est vidée.
                      </p>
                    </div>

                    <div className="pt-2">
                      <strong className="text-slate-900">4. Conformité Loi 18-07 &amp; Secret Bancaire :</strong>
                      <p className="text-slate-600">
                        Le mode confidentialité permet de masquer les comptes CCP et RIB bancaires à l’écran (ex. 00799999••••••••12)
                        afin d'éviter les regards indiscrets lors des revues d’anomalies en agence.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: SCRIPTS VIEWER */}
      {activeTab === 'scripts' && (
        <div className="rounded-md border border-slate-200 bg-white p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Scripts de Lancement &amp; Automatisation</h3>
              <p className="text-xs text-slate-500">
                Visualisez ou copiez directement le code des scripts inclus dans le pack hors-ligne.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveScript('win')}
                className={`rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  activeScript === 'win' ? 'bg-[#0F2942] text-white' : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                Windows (.bat)
              </button>
              <button
                type="button"
                onClick={() => setActiveScript('server')}
                className={`rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  activeScript === 'server' ? 'bg-[#0F2942] text-white' : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                Serveur LAN (.bat)
              </button>
              <button
                type="button"
                onClick={() => setActiveScript('linux')}
                className={`rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  activeScript === 'linux' ? 'bg-[#0F2942] text-white' : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                Linux (.sh)
              </button>
              <button
                type="button"
                onClick={() => setActiveScript('vbs')}
                className={`rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  activeScript === 'vbs' ? 'bg-[#0F2942] text-white' : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                Raccourci Bureau (.vbs)
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-slate-900">{scriptsData[activeScript].name}</span>
                <span className="text-slate-500">· {scriptsData[activeScript].desc}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopy(scriptsData[activeScript].content, activeScript)}
                  className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>{copiedScript === activeScript ? 'Copié !' : 'Copier le script'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => triggerFileDownload(scriptsData[activeScript].content, scriptsData[activeScript].name)}
                  className="inline-flex items-center gap-1 rounded bg-[#0F2942] px-2.5 py-1 text-xs text-white hover:bg-[#163A5C]"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Télécharger</span>
                </button>
              </div>
            </div>

            <pre className="overflow-x-auto rounded border border-slate-200 bg-slate-900 p-4 font-mono text-xs text-slate-100 leading-relaxed max-h-96">
              {scriptsData[activeScript].content}
            </pre>
          </div>
        </div>
      )}

      {/* TAB 4: DIAGNOSTIC & CERTIFICATION */}
      {activeTab === 'diagnostic' && (
        <div className="space-y-6">
          {/* Environment Health Grid */}
          <div className="rounded-md border border-slate-200 bg-white p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">État de l’environnement &amp; Compatibilité Navigateur</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div className="rounded border border-slate-200 p-3.5 bg-slate-50 space-y-1">
                <p className="text-slate-500">Connectivité détectée</p>
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  {isOnline && !simulatedOffline ? (
                    <>
                      <Wifi className="h-4 w-4 text-emerald-600" />
                      <span>En ligne (Navigateur)</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="h-4 w-4 text-amber-600" />
                      <span>Hors-ligne {simulatedOffline ? '(Simulé)' : '(Déconnecté)'}</span>
                    </>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  VérifCCP fonctionne de manière 100% identique dans les deux cas.
                </p>
              </div>

              <div className="rounded border border-slate-200 p-3.5 bg-slate-50 space-y-1">
                <p className="text-slate-500">Stockage local (LocalStorage)</p>
                <div className="flex items-center gap-2 font-bold text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Opérationnel (Profils)</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Permet de conserver vos profils et règles personnalisées localement.
                </p>
              </div>

              <div className="rounded border border-slate-200 p-3.5 bg-slate-50 space-y-1">
                <p className="text-slate-500">Cryptographie (WebCrypto)</p>
                <div className="flex items-center gap-2 font-bold text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Disponible (SHA-256)</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Calcul instantané des empreintes numériques de fichiers.
                </p>
              </div>

              <div className="rounded border border-slate-200 p-3.5 bg-slate-50 space-y-1">
                <p className="text-slate-500">Lecteur de fichiers (FileReader)</p>
                <div className="flex items-center gap-2 font-bold text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Supporté (TXT / CSV / XLSX)</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Décodage rapide en mémoire vive sans passer par un serveur.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="text-xs text-slate-600">Simuler une coupure de réseau pour tester la robustesse hors-ligne :</span>
              <button
                type="button"
                onClick={() => setSimulatedOffline((v) => !v)}
                className={`rounded px-3 py-1.5 text-xs font-medium border transition-colors ${
                  simulatedOffline
                    ? 'border-amber-300 bg-amber-50 text-amber-800'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {simulatedOffline ? 'Désactiver la simulation hors-ligne' : 'Activer le mode hors-ligne simulé'}
              </button>
            </div>
          </div>

          {/* SHA-256 Integrity Calculator */}
          <div className="rounded-md border border-slate-200 bg-white p-6 space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Calculateur d’Empreinte SHA-256 (Certification d'Intégrité Clé USB)
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Avant de transférer un fichier de virement ou le pack hors-ligne sur votre clé USB, vous pouvez vérifier
                son empreinte SHA-256 pour prouver qu’il n’a subi aucune altération ni corruption.
              </p>
            </div>

            <div className="space-y-3">
              <label htmlFor="sha-input" className="block text-xs font-semibold text-slate-700">
                Texte ou extrait de fichier à certifier :
              </label>
              <textarea
                id="sha-input"
                rows={3}
                value={shaInput}
                onChange={(e) => void handleCalculateSha(e.target.value)}
                placeholder="Collez ici une ligne de virement ou un extrait pour calculer son empreinte SHA-256..."
                className="w-full rounded border border-slate-300 p-2.5 font-mono text-xs text-slate-800"
              />

              {calculatedHash && (
                <div className="rounded border border-slate-200 bg-slate-50 p-3 space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-700">Empreinte SHA-256 calculée :</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(calculatedHash, 'hash')}
                      className="text-[#0F2942] hover:underline font-medium"
                    >
                      {copiedScript === 'hash' ? 'Copié !' : 'Copier l’empreinte'}
                    </button>
                  </div>
                  <p className="font-mono text-xs text-emerald-800 font-semibold break-all select-all">
                    {calculatedHash}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
