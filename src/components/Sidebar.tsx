import {
  BookOpen,
  Calculator,
  Eye,
  EyeOff,
  FileCheck2,
  FilePlus2,
  FlaskConical,
  HardDriveDownload,
  LayoutDashboard,
  Lock,
  SlidersHorizontal,
  Trash2,
  Upload,
} from 'lucide-react';

export type NavTab = 'dashboard' | 'import' | 'results' | 'calculator' | 'builder' | 'profiles' | 'tests' | 'docs' | 'offline';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  hasActiveReport: boolean;
  privacyMode: boolean;
  onTogglePrivacy: () => void;
  onPurgeSession: () => void;
  historyCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: Array<{ id: NavTab; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { id: 'import', label: 'Importer et analyser', icon: Upload },
  { id: 'results', label: 'Résultats et anomalies', icon: FileCheck2 },
  { id: 'calculator', label: 'Calculateur clé CCP', icon: Calculator },
  { id: 'builder', label: 'Créateur de fichier', icon: FilePlus2 },
  { id: 'profiles', label: 'Profils et règles', icon: SlidersHorizontal },
  { id: 'tests', label: 'Tests automatisés', icon: FlaskConical },
  { id: 'docs', label: 'Documentation', icon: BookOpen },
  { id: 'offline', label: 'Installation hors-ligne', icon: HardDriveDownload },
];

export function Sidebar({
  activeTab,
  onSelectTab,
  hasActiveReport,
  privacyMode,
  onTogglePrivacy,
  onPurgeSession,
  historyCount,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const handleNav = (id: NavTab) => {
    onSelectTab(id);
    onCloseMobile();
  };

  const navContent = (
    <div className="flex h-full flex-col bg-[#0F2942] text-slate-100">
      {/* Brand zone: single crisp wordmark */}
      <div className="flex h-16 items-center border-b border-white/10 px-6">
        <button
          type="button"
          onClick={() => handleNav('dashboard')}
          className="text-left font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          VérifCCP
        </button>
      </div>

      {/* Primary navigation */}
      <nav className="flex-1 space-y-1 px-3 py-5" aria-label="Navigation principale">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const isResultsReady = item.id === 'results' && hasActiveReport;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNav(item.id)}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-white/15 text-white'
                  : 'text-slate-300 hover:bg-white/8 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-3 min-w-0">
                <Icon className="h-4 w-4 shrink-0 opacity-85" />
                <span className="truncate">{item.label}</span>
              </span>
              {isResultsReady && (
                <span className="text-[11px] font-mono text-amber-300 shrink-0">Actif</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Confidentiality & local storage controls */}
      <div className="border-t border-white/10 p-4 space-y-3">
        <button
          type="button"
          onClick={onTogglePrivacy}
          className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
            privacyMode
              ? 'border-amber-400/50 bg-amber-400/15 text-amber-100'
              : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'
          }`}
        >
          <span className="flex items-center gap-2">
            {privacyMode ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            <span>Mode confidentialité</span>
          </span>
          <span className="font-mono text-[11px]">{privacyMode ? 'ACTIF' : 'INACTIF'}</span>
        </button>

        {historyCount > 0 && (
          <button
            type="button"
            onClick={onPurgeSession}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/10 hover:text-white transition-colors whitespace-nowrap"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Purger l’historique ({historyCount})</span>
          </button>
        )}

        <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-400">
          <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span>Traitement 100 % local · Hors ligne</span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop fixed sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:block lg:w-64">
        {navContent}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-slate-900/50" onClick={onCloseMobile} />
          <div className="fixed inset-y-0 left-0 w-64 shadow-xl">{navContent}</div>
        </div>
      )}
    </>
  );
}
