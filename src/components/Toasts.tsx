import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { useStore } from '../store';
import type { Toast } from '../types';

const ICONS: Record<Toast['kind'], typeof Info> = {
  success: CheckCircle2,
  info: Info,
  error: TriangleAlert,
};

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const removeToast = useStore((s) => s.removeToast);

  return (
    <div className="toasts" aria-live="polite" role="status">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.kind];
        return (
          <div key={toast.id} className={`toast toast--${toast.kind}`}>
            <Icon size={16} aria-hidden="true" />
            <span className="toast__text">{toast.text}</span>
            <button
              type="button"
              className="toast__close"
              onClick={() => removeToast(toast.id)}
              aria-label="Fermer la notification"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
