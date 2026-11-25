import React, { useEffect, useRef, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Info,
  ShieldAlert,
  X,
} from 'lucide-react';
import { ToastItem } from '../types/toast';

interface ToastNotificationProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

export function ToastNotification({ toast, onDismiss }: ToastNotificationProps) {
  const duration = toast.duration ?? (toast.type === 'critical' ? 10000 : 6000);
  const [progress, setProgress] = useState(100);
  const [isPaused, setIsPaused] = useState(false);
  const startTimeRef = useRef<number>(Date.now());
  const remainingTimeRef = useRef<number>(duration);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Auto-dismiss with progress tracking and pause-on-hover
  useEffect(() => {
    if (duration <= 0) return; // Toast persistant

    let lastTick = Date.now();

    const updateProgress = () => {
      if (!isPaused) {
        const now = Date.now();
        const delta = now - lastTick;
        lastTick = now;

        remainingTimeRef.current = Math.max(0, remainingTimeRef.current - delta);
        const ratio = (remainingTimeRef.current / duration) * 100;
        setProgress(ratio);

        if (remainingTimeRef.current <= 0) {
          onDismiss(toast.id);
          return;
        }
      } else {
        lastTick = Date.now();
      }

      animFrameRef.current = requestAnimationFrame(updateProgress);
    };

    animFrameRef.current = requestAnimationFrame(updateProgress);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.id, duration, isPaused, onDismiss]);

  const handleMouseEnter = () => setIsPaused(true);
  const handleMouseLeave = () => setIsPaused(false);

  const isCritical = toast.type === 'critical';
  const isError = toast.type === 'error';
  const isWarning = toast.type === 'warning';
  const isSuccess = toast.type === 'success';

  return (
    <div
      role="alert"
      aria-live={isCritical ? 'assertive' : 'polite'}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`pointer-events-auto relative w-full overflow-hidden rounded-md border shadow-xl transition-all duration-200 ${
        isCritical
          ? 'border-red-600/80 bg-[#140608] dark:bg-[#1A080B] text-white ring-1 ring-red-500/20'
          : isError
          ? 'border-red-500/60 bg-[#160B0E] text-slate-100 ring-1 ring-red-500/10'
          : isWarning
          ? 'border-amber-400/70 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100'
          : isSuccess
          ? 'border-emerald-500/60 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100'
          : 'border-slate-300 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100'
      }`}
    >
      {/* Top Banner Accent for Critical */}
      {isCritical && (
        <div className="flex items-center justify-between border-b border-red-500/25 bg-red-950/70 px-3.5 py-1.5 text-[11px] font-semibold text-red-200">
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
            </span>
            <span className="tracking-wide uppercase font-mono text-[10px]">Alerte Bloquante Algérie Poste</span>
          </div>
          {toast.criticalCount !== undefined && (
            <span className="font-mono text-[11px] font-bold text-red-300">
              {toast.criticalCount} anomalie{toast.criticalCount > 1 ? 's' : ''} critique{toast.criticalCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* Main Toast Content */}
      <div className="p-3.5 sm:p-4">
        <div className="flex items-start gap-3">
          {/* Status Icon */}
          <div className="shrink-0 mt-0.5">
            {isCritical ? (
              <div className="rounded bg-red-500/20 p-1.5 text-red-400">
                <ShieldAlert className="h-5 w-5" />
              </div>
            ) : isError ? (
              <div className="rounded bg-red-500/15 p-1.5 text-red-400">
                <AlertOctagon className="h-5 w-5" />
              </div>
            ) : isWarning ? (
              <div className="rounded bg-amber-500/15 p-1.5 text-amber-500">
                <AlertTriangle className="h-5 w-5" />
              </div>
            ) : isSuccess ? (
              <div className="rounded bg-emerald-500/15 p-1.5 text-emerald-500">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            ) : (
              <div className="rounded bg-slate-500/15 p-1.5 text-slate-400">
                <Info className="h-5 w-5" />
              </div>
            )}
          </div>

          {/* Texts */}
          <div className="flex-1 min-w-0 pr-2">
            <h4
              className={`text-sm font-semibold tracking-tight ${
                isCritical ? 'text-white' : 'text-slate-900 dark:text-white'
              }`}
            >
              {toast.title}
            </h4>

            {toast.fileName && (
              <div className="mt-1 flex items-center gap-1.5">
                <span className="text-[11px] text-slate-400">Fichier :</span>
                <span className="font-mono text-xs font-medium text-amber-300 truncate max-w-[220px]">
                  {toast.fileName}
                </span>
              </div>
            )}

            <p
              className={`mt-1 text-xs leading-relaxed ${
                isCritical ? 'text-slate-300' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {toast.message}
            </p>

            {toast.detail && (
              <p
                className={`mt-1 font-mono text-[11px] ${
                  isCritical ? 'text-red-300/90' : 'text-slate-500'
                }`}
              >
                {toast.detail}
              </p>
            )}

            {/* Action Buttons */}
            {(toast.action || toast.secondaryAction) && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {toast.action && (
                  <button
                    type="button"
                    onClick={() => {
                      toast.action?.onClick();
                      onDismiss(toast.id);
                    }}
                    className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
                      isCritical
                        ? 'bg-red-600 text-white hover:bg-red-700 shadow-sm shadow-red-900/50'
                        : 'bg-[#0F2942] text-white hover:bg-[#163A5C]'
                    }`}
                  >
                    <span>{toast.action.label}</span>
                    <ArrowRight className="h-3 w-3" />
                  </button>
                )}

                {toast.secondaryAction && (
                  <button
                    type="button"
                    onClick={() => {
                      toast.secondaryAction?.onClick();
                      onDismiss(toast.id);
                    }}
                    className="rounded border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/20 transition-colors"
                  >
                    {toast.secondaryAction.label}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label="Fermer la notification"
            title="Fermer (Échap)"
            className={`shrink-0 rounded p-1 transition-colors ${
              isCritical
                ? 'text-slate-400 hover:bg-white/10 hover:text-white'
                : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Shrinking Countdown Progress Bar */}
      {duration > 0 && (
        <div className="h-1 w-full bg-black/30 dark:bg-black/50">
          <div
            className={`h-full transition-all duration-75 ${
              isCritical
                ? 'bg-red-500'
                : isError
                ? 'bg-red-500'
                : isWarning
                ? 'bg-amber-500'
                : isSuccess
                ? 'bg-emerald-500'
                : 'bg-slate-400'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
