export type ToastType = 'critical' | 'error' | 'warning' | 'success' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
  iconName?: 'arrow' | 'search' | 'shield';
}

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message: string;
  detail?: string;
  criticalCount?: number;
  totalAnomalies?: number;
  fileName?: string;
  reportId?: string;
  createdAt: number;
  duration?: number; // en ms, 0 = persistant jusqu'au clic
  action?: ToastAction;
  secondaryAction?: ToastAction;
  read?: boolean;
}
