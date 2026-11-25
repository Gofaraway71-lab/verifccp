import { useEffect, useRef } from 'react';
import {
  AlertOctagon,
  ArrowRight,
  Bell,
  BellOff,
  CheckCircle2,
  FileText,
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { ToastItem } from '../types/toast';

interface NotificationCenterDropdownProps {
  notifications: ToastItem[];
  isOpen: boolean;
  onClose: () => void;
  onOpenReport: (reportId: string, filter?: 'critical' | 'all') => void;
  onClearNotifications: () => void;
  onTestCriticalToast: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
}

export function NotificationCenterDropdown({
  notifications,
  isOpen,
  onClose,
  onOpenReport,
  onClearNotifications,
  onTestCriticalToast,
  soundEnabled,
  onToggleSound,
}: NotificationCenterDropdownProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const criticalCount = notifications.filter((n) => n.type === 'critical').length;

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-12 z-50 w-80 sm:w-96 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-4 py-3">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-[#0F2942] dark:text-slate-300" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Alertes & Notifications
          </h3>
          {criticalCount > 0 && (
            <span className="font-mono text-[10px] font-bold text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-950/60 px-1.5 py-0.5 rounded">
              {criticalCount} critique{criticalCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Preferences & Quick Actions Strip */}
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 bg-white dark:bg-slate-900 px-4 py-2 text-xs">
        <button
          type="button"
          onClick={onToggleSound}
          className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          {soundEnabled ? (
            <>
              <Bell className="h-3.5 w-3.5 text-amber-500" />
              <span>Alerte sonore : Activée</span>
            </>
          ) : (
            <>
              <BellOff className="h-3.5 w-3.5 text-slate-400" />
              <span>Alerte sonore : Muette</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onTestCriticalToast}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 dark:text-red-400 hover:underline"
        >
          <Sparkles className="h-3 w-3" />
          <span>Simuler alerte critique</span>
        </button>
      </div>

      {/* Notification List */}
      <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
        {notifications.length === 0 ? (
          <div className="p-6 text-center text-slate-500 dark:text-slate-400">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500 opacity-80" />
            <p className="mt-2 text-xs font-medium text-slate-700 dark:text-slate-300">
              Aucune alerte active
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              Les anomalies critiques détectées lors de vos analyses apparaîtront ici immédiatement.
            </p>
          </div>
        ) : (
          notifications.map((item) => {
            const isCrit = item.type === 'critical';
            return (
              <div
                key={item.id}
                className={`p-3.5 transition-colors ${
                  isCrit
                    ? 'bg-red-50/60 dark:bg-red-950/20 hover:bg-red-50 dark:hover:bg-red-950/30'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="shrink-0 mt-0.5">
                    {isCrit ? (
                      <ShieldAlert className="h-4 w-4 text-red-600 dark:text-red-400" />
                    ) : item.type === 'success' ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <AlertOctagon className="h-4 w-4 text-amber-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {item.title}
                      </p>
                      <span className="font-mono text-[10px] text-slate-400 shrink-0">
                        {new Date(item.createdAt).toLocaleTimeString('fr-FR', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>

                    {item.fileName && (
                      <p className="font-mono text-[11px] text-slate-600 dark:text-slate-400 truncate mt-0.5">
                        {item.fileName}
                      </p>
                    )}

                    <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 leading-snug">
                      {item.message}
                    </p>

                    {item.reportId && (
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            onOpenReport(item.reportId!, isCrit ? 'critical' : 'all');
                            onClose();
                          }}
                          className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold transition-colors ${
                            isCrit
                              ? 'bg-red-600 text-white hover:bg-red-700'
                              : 'bg-slate-800 text-white hover:bg-slate-700'
                          }`}
                        >
                          <span>Inspecter</span>
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
        <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-4 py-2 text-xs">
          <span className="text-[11px] text-slate-500">
            {notifications.length} notification{notifications.length > 1 ? 's' : ''}
          </span>
          <button
            type="button"
            onClick={onClearNotifications}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 transition-colors"
          >
            <Trash2 className="h-3 w-3" />
            <span>Tout effacer</span>
          </button>
        </div>
      )}
    </div>
  );
}
