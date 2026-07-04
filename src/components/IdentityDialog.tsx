import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useStore } from '../store';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * « Comment doit-on vous appeler ? » — demandé une fois, avant le premier
 * commentaire, et à chaque fois que `identityAsk` est déclenché. Modal
 * accessible : `role=dialog`, `aria-modal`, focus trap, fermeture Échap.
 */
export function IdentityDialog() {
  const identityAsk = useStore((s) => s.identityAsk);
  const setIdentity = useStore((s) => s.setIdentity);
  const [name, setName] = useState('');
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!identityAsk) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, [identityAsk]);

  if (!identityAsk) return null;

  function cancel() {
    useStore.setState({ identityAsk: false, pendingIdentityAction: null });
    setName('');
  }

  function submit() {
    if (!name.trim()) return;
    setIdentity(name);
    setName('');
  }

  function trapFocus(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
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
    <div className="palette-backdrop" onClick={cancel} onKeyDown={trapFocus}>
      <div
        ref={dialogRef}
        className="identity-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="identity-dialog-title"
        aria-describedby="identity-dialog-hint"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="identity-dialog-title">Comment doit-on vous appeler ?</h2>
        <p id="identity-dialog-hint" className="identity-dialog__hint">
          Votre nom signera vos commentaires, rien ne quitte cet ordinateur.
        </p>
        <input
          ref={inputRef}
          type="text"
          value={name}
          placeholder="Votre nom"
          aria-label="Votre nom"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="identity-dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={cancel}>
            Annuler
          </button>
          <button type="button" className="btn btn--primary" onClick={submit} disabled={!name.trim()}>
            Continuer
          </button>
        </div>
      </div>
    </div>
  );
}
