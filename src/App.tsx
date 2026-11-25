import { useEffect, useState } from 'react';
import { Bell, Eye, EyeOff, Menu, Moon, Sun, Upload } from 'lucide-react';
import {
  AnalysisReport,
  DecodedFileResult,
  FormatDetectionResult,
  HistoryEntry,
  ValidationProfile,
} from './types/ccp';
import { ToastItem } from './types/toast';
import { analyzeDecodedFile } from './engine/analyzer';
import { decodeRawStringAsFile } from './engine/fileParser';
import { detectFileFormat } from './engine/formatDetector';
import { buildDefaultProfiles } from './engine/profiles';
import { SAMPLE_FILES_CATALOG } from './engine/samplesAndTests';
import { playAudioAlert } from './engine/soundAlert';
import { CcpKeyCalculatorView } from './components/CcpKeyCalculatorView';
import { DashboardView } from './components/DashboardView';
import { DocsView } from './components/DocsView';
import { FileBuilderView } from './components/FileBuilderView';
import { ImportView } from './components/ImportView';
import { NotificationCenterDropdown } from './components/NotificationCenterDropdown';
import { OfflineInstallView } from './components/OfflineInstallView';
import { ProfilesView } from './components/ProfilesView';
import { AnomalyFilter, ResultsView } from './components/ResultsView';
import { NavTab, Sidebar } from './components/Sidebar';
import { TestsView } from './components/TestsView';
import { ToastContainer } from './components/ToastContainer';

const PROFILES_STORAGE_KEY = 'verifccp_profiles_v5';
const LEGACY_PROFILES_STORAGE_KEYS = ['verifccp_profiles_v4', 'verifccp_profiles_v3'];
const THEME_STORAGE_KEY = 'verifccp_theme';
const SOUND_STORAGE_KEY = 'verifccp_sound_alerts';

function loadInitialSoundPreference(): boolean {
  try {
    const saved = localStorage.getItem(SOUND_STORAGE_KEY);
    if (saved !== null) return saved === 'true';
  } catch {
    // ignore
  }
  return true;
}

type ThemeMode = 'light' | 'dark';

function loadInitialTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // ignore storage errors
  }
  return 'light';
}

const BREADCRUMB_LABELS: Record<NavTab, string> = {
  dashboard: 'Tableau de bord',
  import: 'Importer et analyser',
  results: 'Résultats et anomalies',
  calculator: 'Calculateur clé CCP',
  builder: 'Créateur de fichier',
  profiles: 'Profils et règles',
  tests: 'Tests automatisés',
  docs: 'Documentation',
  offline: 'Installation hors-ligne sur un autre PC',
};

function loadInitialProfiles(): ValidationProfile[] {
  const defaults = buildDefaultProfiles();
  try {
    const raw = localStorage.getItem(PROFILES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].rules) {
        return parsed;
      }
    }
    // Migration douce depuis v4/v3 : actualise les profils intégrés tout en conservant les profils personnalisés
    for (const legacyKey of LEGACY_PROFILES_STORAGE_KEYS) {
      const legacyRaw = localStorage.getItem(legacyKey);
      if (legacyRaw) {
        const legacyParsed = JSON.parse(legacyRaw);
        if (Array.isArray(legacyParsed)) {
          const customOnly = legacyParsed.filter(
            (p: ValidationProfile) => p && !p.isBuiltIn && Array.isArray(p.rules)
          );
          if (customOnly.length > 0) {
            return [...defaults, ...customOnly];
          }
        }
      }
    }
  } catch {
    // fallback silencieux aux profils intégrés
  }
  return defaults;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [privacyMode, setPrivacyMode] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(loadInitialTheme);

  // Profils configurables (aucune donnée sensible CCP stockée ici)
  const [profiles, setProfiles] = useState<ValidationProfile[]>(loadInitialProfiles);

  // Rapports et historique conservés UNIQUEMENT en mémoire vive (zéro stockage persistant des fichiers CCP)
  const [reportsMap, setReportsMap] = useState<Record<string, AnalysisReport>>({});
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);

  // Toast notifications & Centre d'alertes
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [notificationsHistory, setNotificationsHistory] = useState<ToastItem[]>([]);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(loadInitialSoundPreference);
  const [notificationCenterOpen, setNotificationCenterOpen] = useState(false);
  const [resultsInitialFilter, setResultsInitialFilter] = useState<AnomalyFilter | undefined>(undefined);

  useEffect(() => {
    try {
      localStorage.setItem(SOUND_STORAGE_KEY, String(soundEnabled));
    } catch {
      // ignorer
    }
  }, [soundEnabled]);

  const triggerToast = (toast: ToastItem) => {
    setToasts((prev) => [toast, ...prev.filter((t) => t.id !== toast.id)].slice(0, 4));
    setNotificationsHistory((prev) => [toast, ...prev].slice(0, 40));
    playAudioAlert(
      toast.type === 'critical' ? 'critical' : toast.type === 'success' ? 'success' : 'warning',
      !soundEnabled
    );
  };

  const handleDismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleClearAllToasts = () => {
    setToasts([]);
  };

  const handleSimulateCriticalToast = () => {
    const simId = `sim-crit-${Date.now()}`;
    triggerToast({
      id: simId,
      type: 'critical',
      title: '3 anomalies critiques détectées !',
      fileName: 'VIREMENT_DEC2026_TEST_ERREURS.TXT',
      reportId: activeReportId ?? undefined,
      criticalCount: 3,
      message: 'Erreur clé RIP (ligne 2) et discordance de totalisation montant (ligne 1). Rejet immédiat Algérie Poste garanti.',
      detail: 'Clé attendue : 24 vs Reçue : 55 · Total centimes discordant.',
      createdAt: Date.now(),
      duration: 12000,
      action: {
        label: 'Inspecter les anomalies',
        onClick: () => {
          setResultsInitialFilter('critical');
          setActiveTab('results');
        },
      },
      secondaryAction: {
        label: 'Fermer',
        onClick: () => handleDismissToast(simId),
      },
    });
  };

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignorer si quota ou mode privé strict
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles));
    } catch {
      // ignorer si quota ou mode privé strict
    }
  }, [profiles]);

  const activeReport = activeReportId ? reportsMap[activeReportId] ?? null : null;

  const commitReport = (report: AnalysisReport) => {
    setReportsMap((prev) => ({ ...prev, [report.id]: report }));
    const entry: HistoryEntry = {
      id: report.id,
      analyzedAt: report.analyzedAt,
      fileName: report.fileName,
      fileSize: report.fileSize,
      profileName: report.profileName,
      profileFormat: report.profileFormat,
      status: report.status,
      beneficiaryCount: report.summary.beneficiaryCount,
      validRecords: report.summary.validRecords,
      invalidRecords: report.summary.invalidRecords,
      totalAnomalies: report.anomalies.length,
      criticalCount: report.summary.countsBySeverity.critical,
      errorCount: report.summary.countsBySeverity.error,
      warningCount: report.summary.countsBySeverity.warning,
      computedTotalCentimes: report.summary.computedTotalCentimes,
    };
    setHistory((prev) => [entry, ...prev].slice(0, 40));
    setActiveReportId(report.id);

    // Déclenchement de la notification Toast pour alerter immédiatement l'utilisateur
    const critCount = report.summary.countsBySeverity.critical;
    const errCount = report.summary.countsBySeverity.error;
    const warnCount = report.summary.countsBySeverity.warning;

    if (critCount > 0) {
      setResultsInitialFilter('critical');
      triggerToast({
        id: `crit-${report.id}-${Date.now()}`,
        type: 'critical',
        title: `${critCount} anomalie${critCount > 1 ? 's' : ''} critique${critCount > 1 ? 's' : ''} détectée${critCount > 1 ? 's' : ''} !`,
        fileName: report.fileName,
        reportId: report.id,
        criticalCount: critCount,
        message: `Ce fichier sera rejeté par Algérie Poste / Banque si transmis sans correction.`,
        detail: `Format : ${report.profileName} · Lignes invalides : ${report.summary.invalidRecords} / ${report.summary.beneficiaryCount}`,
        createdAt: Date.now(),
        duration: 12000,
        action: {
          label: `Inspecter les ${critCount} critiques`,
          onClick: () => {
            setActiveReportId(report.id);
            setResultsInitialFilter('critical');
            setActiveTab('results');
          },
        },
        secondaryAction: {
          label: 'Tous les résultats',
          onClick: () => {
            setActiveReportId(report.id);
            setResultsInitialFilter('all');
            setActiveTab('results');
          },
        },
      });
    } else if (errCount > 0) {
      setResultsInitialFilter('error');
      triggerToast({
        id: `err-${report.id}-${Date.now()}`,
        type: 'error',
        title: `${errCount} erreur${errCount > 1 ? 's' : ''} détectée${errCount > 1 ? 's' : ''}`,
        fileName: report.fileName,
        reportId: report.id,
        message: `Des anomalies de niveau erreur ont été relevées dans le fichier.`,
        detail: `Format : ${report.profileName} · Lignes invalides : ${report.summary.invalidRecords} / ${report.summary.beneficiaryCount}`,
        createdAt: Date.now(),
        duration: 8000,
        action: {
          label: 'Voir les anomalies',
          onClick: () => {
            setActiveReportId(report.id);
            setResultsInitialFilter('error');
            setActiveTab('results');
          },
        },
      });
    } else if (report.status === 'conforme') {
      setResultsInitialFilter('all');
      triggerToast({
        id: `succ-${report.id}-${Date.now()}`,
        type: 'success',
        title: 'Fichier conforme à 100 %',
        fileName: report.fileName,
        reportId: report.id,
        message: `0 anomalie critique. Fichier validé et prêt pour transmission (${report.summary.beneficiaryCount} bénéficiaires).`,
        createdAt: Date.now(),
        duration: 5000,
        action: {
          label: 'Voir rapport',
          onClick: () => {
            setActiveReportId(report.id);
            setResultsInitialFilter('all');
            setActiveTab('results');
          },
        },
      });
    } else if (warnCount > 0) {
      setResultsInitialFilter('warning');
      triggerToast({
        id: `warn-${report.id}-${Date.now()}`,
        type: 'warning',
        title: `${warnCount} avertissement${warnCount > 1 ? 's' : ''}`,
        fileName: report.fileName,
        reportId: report.id,
        message: `Fichier exploitable mais des points de vigilance ont été identifiés.`,
        createdAt: Date.now(),
        duration: 6000,
      });
    } else {
      setResultsInitialFilter('all');
    }

    setActiveTab('results');
  };

  const handleRunValidation = async (
    decoded: DecodedFileResult,
    detection: FormatDetectionResult,
    profile: ValidationProfile,
    onProgress: (processed: number, total: number) => void,
    signal: AbortSignal
  ) => {
    const report = await analyzeDecodedFile(decoded, detection, profile, { onProgress, signal });
    commitReport(report);
  };

  const handleQuickAnalyzeSample = async (sampleId: string) => {
    const sample = SAMPLE_FILES_CATALOG.find((s) => s.id === sampleId);
    if (!sample) return;
    const decoded = decodeRawStringAsFile(sample.name, sample.content);
    const detection = detectFileFormat(decoded);
    const preferredProfileId = sample.kind === 'rip' ? 'ap-rip-fixed-62' : 'ap-nonrip-fixed-62';
    const profile = profiles.find((p) => p.id === preferredProfileId) ?? profiles[0];
    const report = await analyzeDecodedFile(decoded, detection, profile);
    commitReport(report);
  };

  const handleInspectTestSample = async (
    fileName: string,
    content: string,
    formatHint: 'rip' | 'non-rip' | 'rib' | 'both'
  ) => {
    const decoded = decodeRawStringAsFile(fileName, content);
    const detection = detectFileFormat(decoded);
    let targetId = 'ap-rip-fixed-62';
    if (formatHint === 'rib' || (formatHint === 'both' && detection.detectedFormat === 'rib')) {
      targetId = detection.detectedStructure === 'delimited' || detection.detectedStructure === 'spreadsheet'
        ? 'csv-rib-standard'
        : 'fixed-62-rib';
    } else if (formatHint === 'non-rip' || (formatHint === 'both' && detection.detectedFormat === 'non-rip')) {
      targetId = detection.detectedStructure === 'delimited' || detection.detectedStructure === 'spreadsheet'
        ? 'csv-nonrip-standard'
        : 'ap-nonrip-fixed-62';
    } else if (detection.detectedStructure === 'delimited' || detection.detectedStructure === 'spreadsheet') {
      targetId = 'csv-rip-standard';
    }
    const profile = profiles.find((p) => p.id === targetId) ?? profiles[0];
    const report = await analyzeDecodedFile(decoded, detection, profile);
    commitReport(report);
  };

  const handleOpenReport = (id: string) => {
    if (reportsMap[id]) {
      setActiveReportId(id);
      setActiveTab('results');
    }
  };

  const handleDeleteHistoryItem = (id: string) => {
    setHistory((prev) => prev.filter((h) => h.id !== id));
    setReportsMap((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    if (activeReportId === id) {
      setActiveReportId(null);
    }
  };

  const handlePurgeSession = () => {
    setHistory([]);
    setReportsMap({});
    setActiveReportId(null);
    if (activeTab === 'results') {
      setActiveTab('dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F8FA] text-slate-900">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        hasActiveReport={!!activeReport}
        privacyMode={privacyMode}
        onTogglePrivacy={() => setPrivacyMode((v) => !v)}
        onPurgeSession={handlePurgeSession}
        historyCount={history.length}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="lg:pl-64 flex min-h-screen flex-col">
        {/* Top Contextual Header */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Ouvrir le menu"
              className="rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="font-semibold text-slate-900 whitespace-nowrap">VérifCCP</span>
              <span className="text-slate-300" aria-hidden="true">/</span>
              <span className="text-slate-600 truncate">{BREADCRUMB_LABELS[activeTab]}</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            {/* Centre d'alertes & notifications toast */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotificationCenterOpen((v) => !v)}
                aria-label="Centre d'alertes et notifications"
                title="Centre d'alertes et notifications"
                className={`relative inline-flex items-center justify-center rounded-md border p-2 text-xs font-medium transition-colors ${
                  notificationsHistory.filter((n) => n.type === 'critical').length > 0
                    ? 'border-red-400/80 bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300'
                }`}
              >
                <Bell className="h-3.5 w-3.5" />
                {notificationsHistory.filter((n) => n.type === 'critical').length > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white shadow-sm animate-pulse">
                    {notificationsHistory.filter((n) => n.type === 'critical').length}
                  </span>
                )}
              </button>

              <NotificationCenterDropdown
                isOpen={notificationCenterOpen}
                onClose={() => setNotificationCenterOpen(false)}
                notifications={notificationsHistory}
                soundEnabled={soundEnabled}
                onToggleSound={() => setSoundEnabled((v) => !v)}
                onClearNotifications={() => setNotificationsHistory([])}
                onTestCriticalToast={handleSimulateCriticalToast}
                onOpenReport={(reportId, filter) => {
                  if (reportsMap[reportId]) {
                    setActiveReportId(reportId);
                    setResultsInitialFilter(filter === 'critical' ? 'critical' : 'all');
                    setActiveTab('results');
                  }
                }}
              />
            </div>

            <button
              type="button"
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              aria-pressed={theme === 'dark'}
              aria-label={theme === 'dark' ? 'Activer le mode clair' : 'Activer le mode sombre'}
              title={theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              {theme === 'dark' ? (
                <Sun className="h-3.5 w-3.5 text-amber-400" />
              ) : (
                <Moon className="h-3.5 w-3.5 text-slate-600" />
              )}
              <span className="hidden md:inline">
                {theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setPrivacyMode((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                privacyMode
                  ? 'border-amber-300 bg-amber-50 text-amber-900'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {privacyMode ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">
                {privacyMode ? 'Comptes masqués' : 'Masquer comptes'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('import')}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#0F2942] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#163A5C] transition-colors whitespace-nowrap"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Nouvelle analyse</span>
            </button>
          </div>
        </header>

        {/* Main Workspace Content */}
        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8 max-w-[1360px] w-full mx-auto">
          {activeTab === 'dashboard' && (
            <DashboardView
              history={history}
              hasReportForId={(id) => Boolean(reportsMap[id])}
              getReportById={(id) => reportsMap[id]}
              privacyMode={privacyMode}
              onOpenReport={handleOpenReport}
              onDeleteHistoryItem={handleDeleteHistoryItem}
              onGoImport={() => setActiveTab('import')}
              onGoOfflineInstall={() => setActiveTab('offline')}
              onTriggerTestCriticalToast={handleSimulateCriticalToast}
              onQuickAnalyzeSample={(id) => void handleQuickAnalyzeSample(id)}
            />
          )}

          {activeTab === 'import' && (
            <ImportView profiles={profiles} onRunValidation={handleRunValidation} />
          )}

          {activeTab === 'results' && (
            <ResultsView
              report={activeReport}
              privacyMode={privacyMode}
              initialFilter={resultsInitialFilter}
              onGoImport={() => setActiveTab('import')}
            />
          )}

          {activeTab === 'calculator' && (
            <CcpKeyCalculatorView privacyMode={privacyMode} />
          )}

          {activeTab === 'builder' && (
            <FileBuilderView
              profiles={profiles}
              onCommitReport={commitReport}
              privacyMode={privacyMode}
            />
          )}

          {activeTab === 'profiles' && (
            <ProfilesView
              profiles={profiles}
              onChangeProfiles={setProfiles}
              onResetDefaults={() => setProfiles(buildDefaultProfiles())}
            />
          )}

          {activeTab === 'tests' && (
            <TestsView
              profiles={profiles}
              onInspectTestSample={(name, content, hint) =>
                void handleInspectTestSample(name, content, hint)
              }
            />
          )}

          {activeTab === 'docs' && <DocsView />}

          {activeTab === 'offline' && <OfflineInstallView profiles={profiles} />}
        </main>
      </div>

      {/* Floating Toast Notification Container */}
      <ToastContainer
        toasts={toasts}
        onDismiss={handleDismissToast}
        onClearAll={handleClearAllToasts}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled((v) => !v)}
      />
    </div>
  );
}
