import { useEffect, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { useStore } from '../store';
import { GROUP_LABELS, SHORTCUTS, shortcutTokens, type ShortcutGroup } from '../hooks/useShortcuts';

const GROUP_ORDER: ShortcutGroup[] = ['fichiers', 'affichage', 'commentaires', 'aide'];

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Aide raccourcis (« ? », DESIGN-BRIEF §6) : table complète des raccourcis.
 * Modal accessible (même schéma que IdentityDialog) : focus initial sur le
 * bouton Fermer, piège Tab/Shift+Tab, restauration du focus à la fermeture.
 */
export function ShortcutsOverlay() {
  const shortcutsOpen = useStore((s) => s.shortcutsOpen);
  const toggle = useStore((s) => s.toggle);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!shortcutsOpen) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, [shortcutsOpen]);

  if (!shortcutsOpen) return null;

  function close() {
    toggle('shortcuts');
  }

  function trapFocus(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== 'Tab' || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="palette-backdrop" onClick={close} onKeyDown={trapFocus}>
      <div
        ref={dialogRef}
        className="shortcuts-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Raccourcis clavier"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-[var(--ink-700)] px-6 py-4">
          <h2 className="m-0 font-[var(--font-display)] text-[18px] font-semibold text-white">Raccourcis clavier</h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={close}
            aria-label="Fermer"
            className="inline-flex rounded-[var(--radius-s)] p-1.5 text-[var(--ink-300)] hover:bg-white/10 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex max-h-[70vh] flex-col gap-6 overflow-y-auto px-6 py-5">
          {GROUP_ORDER.map((group) => {
            const defs = SHORTCUTS.filter((d) => d.group === group);
            if (defs.length === 0) return null;
            return (
              <section key={group}>
                <h3 className="m-0 mb-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-300)]">
                  {GROUP_LABELS[group]}
                </h3>
                <ul className="m-0 flex flex-col gap-1.5 p-0">
                  {defs.map((def) => (
                    <li key={def.id} className="flex list-none items-center justify-between gap-6 py-0.5">
                      <span className="font-[var(--font-sans)] text-[13px] text-[var(--ink-100)]">
                        {def.description}
                      </span>
                      <span className="flex flex-shrink-0 items-center gap-1">
                        {shortcutTokens(def).map((token, i) => (
                          <kbd
                            key={i}
                            className="rounded-[var(--radius-s)] border border-[var(--ink-700)] bg-[var(--ink-800)] px-1.5 py-0.5 font-[var(--font-mono)] text-[11px] font-semibold leading-none text-[var(--ink-100)]"
                          >
                            {token}
                          </kbd>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
