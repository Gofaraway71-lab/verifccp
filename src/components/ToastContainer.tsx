import { Bell, BellOff, Trash2 } from 'lucide-react';
import { ToastItem } from '../types/toast';
import { ToastNotification } from './ToastNotification';

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
  onClearAll: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
}

export function ToastContainer({
  toasts,
  onDismiss,
  onClearAll,
  soundEnabled,
  onToggleSound,
}: ToastContainerProps) {
  if (toasts.length === 0) return null;

  const hasCritical = toasts.some((t) => t.type === 'critical');

  return (
    <div
      aria-label="Notifications d'analyse"
      className="fixed top-20 right-3 sm:right-6 z-50 flex flex-col gap-2.5 max-w-[420px] w-full pointer-events-none"
    >
      {/* Toast Bar Controls (Visible if multiple toasts or to quickly toggle sound) */}
      <div className="pointer-events-auto flex items-center justify-between px-1 text-xs">
        <button
          type="button"
          onClick={onToggleSound}
          title={soundEnabled ? 'Désactiver les alertes sonores' : 'Activer les alertes sonores'}
          className="inline-flex items-center gap-1.5 rounded bg-slate-900/80 dark:bg-slate-800/90 backdrop-blur px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:text-white shadow-sm border border-white/10 transition-colors"
        >
          {soundEnabled ? (
            <>
              <Bell className="h-3 w-3 text-amber-400" />
              <span>Son : Activé</span>
            </>
          ) : (
            <>
              <BellOff className="h-3 w-3 text-slate-400" />
              <span>Son : Muet</span>
            </>
          )}
        </button>

        {toasts.length > 1 && (
          <button
            type="button"
            onClick={onClearAll}
            className="inline-flex items-center gap-1 rounded bg-slate-900/80 dark:bg-slate-800/90 backdrop-blur px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:text-white shadow-sm border border-white/10 transition-colors"
          >
            <Trash2 className="h-3 w-3" />
            <span>Tout masquer ({toasts.length})</span>
          </button>
        )}
      </div>

      {/* Render Active Toasts */}
      <div className="flex flex-col gap-2.5">
        {toasts.slice(0, 4).map((toast) => (
          <ToastNotification key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </div>
    </div>
  );
}
