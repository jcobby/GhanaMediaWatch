import { create } from 'zustand';

export type ToastTone = 'success' | 'warning' | 'danger' | 'info';

export interface Toast {
  id: string;
  tone: ToastTone;
  /** What happened. */
  title: string;
  /** What the user can do about it. Required for danger/warning tones. */
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs: number;
}

export type ToastInput = Omit<Toast, 'id' | 'durationMs'> & { durationMs?: number };

interface ToastState {
  toasts: Toast[];
  show: (toast: ToastInput) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

let counter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  show: (toast) => {
    const id = `toast-${++counter}`;
    // Errors linger longer than confirmations — the user has to read and act.
    const durationMs = toast.durationMs ?? (toast.tone === 'danger' ? 6000 : 3500);
    set((state) => ({ toasts: [...state.toasts, { ...toast, id, durationMs }] }));
    return id;
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

/** Imperative entry point for non-React code (sync engine, api layer). */
export const toast = {
  success: (title: string, description?: string) =>
    useToastStore.getState().show({ tone: 'success', title, description }),
  info: (title: string, description?: string) =>
    useToastStore.getState().show({ tone: 'info', title, description }),
  warning: (title: string, description: string) =>
    useToastStore.getState().show({ tone: 'warning', title, description }),
  error: (title: string, description: string) =>
    useToastStore.getState().show({ tone: 'danger', title, description }),
};
