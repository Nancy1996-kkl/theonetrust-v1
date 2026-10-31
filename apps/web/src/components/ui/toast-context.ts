import { createContext, useContext, type ReactNode } from 'react';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface ToastInput {
  tone?: ToastTone;
  message: ReactNode;
  /**
   * Auto-dismiss after this many ms. Errors never auto-dismiss (the donor must be able to
   * read and act on them). Pausing on hover/focus keeps WCAG 2.2.1 timing satisfied.
   */
  durationMs?: number | null;
}

export interface ToastItem extends Required<Pick<ToastInput, 'tone'>> {
  id: number;
  message: ReactNode;
  durationMs: number | null;
}

export interface ToastApi {
  show: (toast: ToastInput) => number;
  dismiss: (id: number) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

export const DEFAULT_TOAST_MS = 8000;

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}
