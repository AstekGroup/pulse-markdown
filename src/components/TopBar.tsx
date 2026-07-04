import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  Download,
  MessageSquarePlus,
  Monitor,
  Moon,
  MoreHorizontal,
  Printer,
  Save,
  Sun,
  Type,
} from 'lucide-react';
import { useStore } from '../store';
import { buildPendingAnchorFromSelection, useAppContentScrollFraction } from '../hooks/useSelectionAnchor';
import type { ThemeMode } from '../types';

const THEME_LABELS: Record<ThemeMode, string> = { light: 'Clair', dark: 'Sombre', system: 'Système' };
const THEME_ICONS: Record<ThemeMode, typeof Sun> = { light: Sun, dark: Moon, system: Monitor };

export function TopBar() {
  const currentEntry = useStore((s) => s.currentEntry);
  const dirty = useStore((s) => s.dirty);
  const saveState = useStore((s) => s.saveState);
  const pendingAnchor = useStore((s) => s.pendingAnchor);
  const commentsOpen = useStore((s) => s.commentsOpen);
  const sourceView = useStore((s) => s.sourceView);
  const theme = useStore((s) => s.theme);
  const docFont = useStore((s) => s.docFont);
  const save = useStore((s) => s.save);
  const exportClean = useStore((s) => s.exportClean);
  const copyAiPrompt = useStore((s) => s.copyAiPrompt);
  const setTheme = useStore((s) => s.setTheme);
  const setDocFont = useStore((s) => s.setDocFont);
  const setPendingAnchor = useStore((s) => s.setPendingAnchor);
  const toggle = useStore((s) => s.toggle);
  const pushToast = useStore((s) => s.pushToast);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const progress = useAppContentScrollFraction();

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const segments = currentEntry?.path.split('/').filter(Boolean) ?? [];
  const fileName = segments.at(-1) ?? currentEntry?.name ?? 'Sans titre';
  const breadcrumb = segments.slice(0, -1);

  function handleComment() {
    if (!commentsOpen) toggle('comments');
    if (pendingAnchor) return;
    // Une sélection de texte est peut-être déjà active dans le document :
    // on la promeut en ancre en attente plutôt que de se contenter du toast
    // (cf. A5 — un utilisateur doit pouvoir commenter sans repasser par la
    // pilule flottante).
    const container = document.querySelector<HTMLElement>('.pulse-doc');
    const pending = container ? buildPendingAnchorFromSelection(container) : null;
    if (pending) {
      setPendingAnchor(pending);
      window.getSelection()?.removeAllRanges();
      return;
    }
    pushToast('info', 'Sélectionnez un passage du document pour le commenter.');
  }

  return (
    <div className="topbar">
      <div className="topbar__row">
        <div className="topbar__title">
          {breadcrumb.length > 0 && (
            <span className="topbar__breadcrumb">
              {breadcrumb.join(' / ')}
              <span aria-hidden="true"> / </span>
            </span>
          )}
          <span className="topbar__filename">{fileName}</span>
          <span
            className={`save-indicator save-indicator--${saveState === 'saving' || dirty ? 'dirty' : 'clean'}`}
            role="status"
            aria-live="polite"
          >
            {saveState === 'saving' ? (
              <>
                <span className="save-indicator__dot" aria-hidden="true" />
                Enregistrement…
              </>
            ) : dirty ? (
              <>
                <span className="save-indicator__dot" aria-hidden="true" />
                Non enregistré
              </>
            ) : currentEntry?.source === 'demo' ? (
              'Document d’exemple'
            ) : (
              <>
                <Check size={13} aria-hidden="true" />
                Enregistré
              </>
            )}
          </span>
        </div>

        <div className="topbar__actions">
          <button type="button" className="btn btn--ghost" onClick={handleComment}>
            <MessageSquarePlus size={16} />
            Commenter
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void save()}
            disabled={saveState === 'saving'}
            aria-busy={saveState === 'saving'}
          >
            <Save size={16} />
            {saveState === 'saving' ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <div className="topbar__menu" ref={menuRef}>
            <button
              type="button"
              className="btn btn--icon"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Plus d'actions"
            >
              <MoreHorizontal size={18} />
            </button>
            {menuOpen && (
              <div className="dropdown" role="menu">
                <button type="button" role="menuitem" onClick={() => (exportClean(), setMenuOpen(false))}>
                  <Download size={15} />
                  Exporter copie propre
                </button>
                <button type="button" role="menuitem" onClick={() => (copyAiPrompt(), setMenuOpen(false))}>
                  <Copy size={15} />
                  Copier le prompt IA
                </button>
                <button type="button" role="menuitem" onClick={() => (window.print(), setMenuOpen(false))}>
                  <Printer size={15} />
                  Imprimer
                </button>
                <button type="button" role="menuitem" onClick={() => (toggle('source'), setMenuOpen(false))}>
                  <Code2 size={15} />
                  {sourceView ? 'Vue rendue' : 'Vue source'}
                </button>
                <div className="dropdown__section">
                  <span className="dropdown__label">Thème</span>
                  <div className="dropdown__choices">
                    {(['light', 'dark', 'system'] as const).map((mode) => {
                      const Icon = THEME_ICONS[mode];
                      return (
                        <button
                          key={mode}
                          type="button"
                          className={theme === mode ? 'is-selected' : ''}
                          onClick={() => setTheme(mode)}
                        >
                          <Icon size={14} />
                          {THEME_LABELS[mode]}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="dropdown__section">
                  <span className="dropdown__label">
                    <Type size={13} /> Police du document
                  </span>
                  <div className="dropdown__choices">
                    <button
                      type="button"
                      className={docFont === 'serif' ? 'is-selected' : ''}
                      onClick={() => setDocFont('serif')}
                    >
                      Éditorial
                    </button>
                    <button
                      type="button"
                      className={docFont === 'sans' ? 'is-selected' : ''}
                      onClick={() => setDocFont('sans')}
                    >
                      Sans-serif
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="reading-progress" style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />
    </div>
  );
}
