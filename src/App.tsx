import { useEffect, useState } from 'react';
import { Eye, EyeOff, Menu, Moon, Sun, Upload } from 'lucide-react';
import {
  AnalysisReport,
  DecodedFileResult,
  FormatDetectionResult,
  HistoryEntry,
  ValidationProfile,
} from './types/ccp';
import { analyzeDecodedFile } from './engine/analyzer';
import { decodeRawStringAsFile } from './engine/fileParser';
import { detectFileFormat } from './engine/formatDetector';
import { buildDefaultProfiles } from './engine/profiles';
import { SAMPLE_FILES_CATALOG } from './engine/samplesAndTests';
import { CcpKeyCalculatorView } from './components/CcpKeyCalculatorView';
import { DashboardView } from './components/DashboardView';
import { DocsView } from './components/DocsView';
import { FileBuilderView } from './components/FileBuilderView';
import { ImportView } from './components/ImportView';
import { OfflineInstallView } from './components/OfflineInstallView';
import { ProfilesView } from './components/ProfilesView';
import { ResultsView } from './components/ResultsView';
import { NavTab, Sidebar } from './components/Sidebar';
import { TestsView } from './components/TestsView';

const PROFILES_STORAGE_KEY = 'verifccp_profiles_v5';
const LEGACY_PROFILES_STORAGE_KEYS = ['verifccp_profiles_v4', 'verifccp_profiles_v3'];
const THEME_STORAGE_KEY = 'verifccp_theme';

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
    </div>
  );
}
